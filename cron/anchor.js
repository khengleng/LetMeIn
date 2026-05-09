const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const REFERRAL_ANCHOR_ABI = [
  'function anchorBatch(bytes32 tenantHash, bytes32 merkleRoot) external',
];

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const ANCHOR_CONTRACT_ADDRESS = process.env.ANCHOR_CONTRACT_ADDRESS || '';

const MAX_RETRIES = Number(process.env.ANCHOR_MAX_RETRIES || '3');
const RETRY_DELAY_MS = Number(process.env.ANCHOR_RETRY_DELAY_MS || '2000');
const REQUEST_LIMIT = Number(process.env.ANCHOR_FETCH_LIMIT || '10000');

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

function toHex32(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function leafHash(ref) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'string', 'string', 'string'],
      [toHex32(ref.tenant_id), ref.referrer_code, ref.referee_phone_hash, ref.occurred_at],
    ),
  );
}

function hashPair(a, b) {
  const [left, right] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([left, right]));
}

function buildMerkleRoot(leaves) {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle root from empty leaves');
  }

  let level = [...leaves];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0];
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn) {
  let attempt = 0;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`[anchor] ${label} failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
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
    console.log('[anchor] No unanchored referrals found.');
    return { anchoredTenantBatches: 0, anchoredReferrals: 0 };
  }

  const byTenant = new Map();
  for (const ref of referrals) {
    const list = byTenant.get(ref.tenant_id) ?? [];
    list.push(ref);
    byTenant.set(ref.tenant_id, list);
  }

  let anchoredTenantBatches = 0;
  let anchoredReferrals = 0;

  for (const [tenantId, tenantRefs] of byTenant.entries()) {
    console.log(`[anchor] Anchoring ${tenantRefs.length} referrals for tenant ${tenantId}...`);
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

    console.log(`[anchor] Tx confirmed: ${receipt.hash}`);

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

module.exports = { runBatchAnchor };
