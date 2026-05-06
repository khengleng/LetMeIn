import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { ethers } from 'https://esm.sh/ethers@6.13.2';

type ReferralRow = {
  id: string;
  tenant_id: string;
  referrer_code: string;
  referee_phone_hash: string;
  occurred_at: string;
  referral_hash: string;
  metadata: Record<string, unknown>;
};

const REFERRAL_ANCHOR_ABI = [
  'function anchorBatch(bytes32 tenantHash, bytes32 merkleRoot) external',
] as const;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const POLYGON_RPC_URL = Deno.env.get('POLYGON_RPC_URL') ?? '';
const PRIVATE_KEY = Deno.env.get('PRIVATE_KEY') ?? '';
const ANCHOR_CONTRACT_ADDRESS = Deno.env.get('ANCHOR_CONTRACT_ADDRESS') ?? '';

const MAX_RETRIES = Number(Deno.env.get('ANCHOR_MAX_RETRIES') ?? '3');
const RETRY_DELAY_MS = Number(Deno.env.get('ANCHOR_RETRY_DELAY_MS') ?? '2000');
const REQUEST_LIMIT = Number(Deno.env.get('ANCHOR_FETCH_LIMIT') ?? '10000');

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_ALERT_CHAT_ID = Deno.env.get('TELEGRAM_ALERT_CHAT_ID') ?? '';

function assertEnv() {
  const required = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['POLYGON_RPC_URL', POLYGON_RPC_URL],
    ['PRIVATE_KEY', PRIVATE_KEY],
    ['ANCHOR_CONTRACT_ADDRESS', ANCHOR_CONTRACT_ADDRESS],
  ];

  for (const [key, value] of required) {
    if (!value) throw new Error(`Missing env var: ${key}`);
  }
}

function toHex32(value: string): `0x${string}` {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function leafHash(ref: ReferralRow): `0x${string}` {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'string', 'string', 'string'],
      [toHex32(ref.tenant_id), ref.referrer_code, ref.referee_phone_hash, ref.occurred_at],
    ),
  );
}

function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  const [left, right] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([left, right]));
}

function buildMerkleRoot(leaves: `0x${string}`[]): `0x${string}` {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle root from empty leaves');
  }

  let level = [...leaves];
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0];
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyTelegramFailure(message: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ALERT_CHAT_ID) return;

  const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_ALERT_CHAT_ID,
      text: message,
      disable_web_page_preview: true,
    }),
  }).catch((error) => {
    console.error('[anchor-batch] telegram alert failed:', error);
  });
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`[anchor-batch] ${label} failed (attempt ${attempt}/${MAX_RETRIES}):`, error);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

async function runBatchAnchor() {
  assertEnv();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(ANCHOR_CONTRACT_ADDRESS, REFERRAL_ANCHOR_ABI, signer);

  const { data: referrals, error } = await supabase
    .from('referrals')
    .select('id, tenant_id, referrer_code, referee_phone_hash, occurred_at, referral_hash, metadata')
    .or('metadata.is.null,metadata->>anchor_tx_hash.is.null')
    .order('occurred_at', { ascending: true })
    .limit(REQUEST_LIMIT);

  if (error) throw new Error(`Failed to load referrals: ${error.message}`);

  if (!referrals || referrals.length === 0) {
    return { anchoredTenantBatches: 0, anchoredReferrals: 0 };
  }

  const byTenant = new Map<string, ReferralRow[]>();
  for (const ref of referrals as ReferralRow[]) {
    const list = byTenant.get(ref.tenant_id) ?? [];
    list.push(ref);
    byTenant.set(ref.tenant_id, list);
  }

  let anchoredTenantBatches = 0;
  let anchoredReferrals = 0;

  for (const [tenantId, tenantRefs] of byTenant.entries()) {
    const tenantHash = toHex32(tenantId);
    const leaves = tenantRefs.map(leafHash);
    const merkleRoot = buildMerkleRoot(leaves);

    const txResponse = await withRetry(`anchor tx tenant=${tenantId}`, async () => {
      return await contract.anchorBatch(tenantHash, merkleRoot);
    });

    const receipt = await withRetry(`tx receipt tenant=${tenantId}`, async () => {
      const mined = await txResponse.wait();
      if (!mined) throw new Error('Transaction receipt is null');
      return mined;
    });

    const batchInsert = {
      tenant_id: tenantId,
      tenant_hash: tenantHash,
      merkle_root: merkleRoot,
      referral_count: tenantRefs.length,
      tx_hash: receipt.hash,
      block_number: Number(receipt.blockNumber),
      chain_id: Number((await provider.getNetwork()).chainId),
      anchored_at: new Date().toISOString(),
      status: 'anchored',
    };

    const { data: batch, error: batchError } = await supabase
      .from('referral_anchor_batches')
      .insert(batchInsert)
      .select('id')
      .single();

    if (batchError) {
      throw new Error(`Failed storing anchor batch: ${batchError.message}`);
    }

    const referralIds = tenantRefs.map((r) => r.id);
    const { error: updateError } = await supabase.rpc('mark_referrals_anchored', {
      p_referral_ids: referralIds,
      p_anchor_batch_id: batch.id,
      p_tx_hash: receipt.hash,
      p_block_number: Number(receipt.blockNumber),
      p_merkle_root: merkleRoot,
    });

    if (updateError) {
      throw new Error(`Failed updating referrals as anchored: ${updateError.message}`);
    }

    anchoredTenantBatches += 1;
    anchoredReferrals += tenantRefs.length;
  }

  return { anchoredTenantBatches, anchoredReferrals };
}

Deno.serve(async () => {
  try {
    const result = await runBatchAnchor();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = `[anchor-batch] failed: ${(error as Error).message}`;
    console.error(message, error);
    await notifyTelegramFailure(message);

    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
