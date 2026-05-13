import { adminSupabase } from '../lib/admin-supabase';
import { requireOperator } from '../lib/auth-guard';

async function checkUrl(url: string, expected = 200) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return { ok: res.status === expected, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export default async function AdminHealthPage() {
  await requireOperator();

  const botBase = process.env.BOT_PUBLIC_URL || '';
  const cronBase = process.env.CRON_PUBLIC_URL || '';

  const [tenantCount, referralCount, payoutCount, lastAnchoredRef, botHealth, cronHealth] = await Promise.all([
    adminSupabase.from('tenants').select('id', { count: 'exact', head: true }),
    adminSupabase.from('referrals').select('id', { count: 'exact', head: true }),
    adminSupabase.from('payouts').select('id', { count: 'exact', head: true }),
    adminSupabase
      .from('referrals')
      .select('anchor_tx_hash,anchor_block_number,updated_at')
      .not('anchor_tx_hash', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    botBase ? checkUrl(`${botBase.replace(/\/+$/, '')}/health`) : Promise.resolve({ ok: false, status: 0 }),
    cronBase ? checkUrl(`${cronBase.replace(/\/+$/, '')}/ping`) : Promise.resolve({ ok: false, status: 0 }),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">System Health</h2>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card label="Tenants" value={String(tenantCount.count || 0)} />
        <Card label="Referrals" value={String(referralCount.count || 0)} />
        <Card label="Payout Records" value={String(payoutCount.count || 0)} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatusCard title="Bot Webhook Service" ok={botHealth.ok} status={botHealth.status} endpoint={botBase ? `${botBase}/health` : 'BOT_PUBLIC_URL missing'} />
        <StatusCard title="Cron Service" ok={cronHealth.ok} status={cronHealth.status} endpoint={cronBase ? `${cronBase}/ping` : 'CRON_PUBLIC_URL missing'} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Last Blockchain Anchor</h3>
        {lastAnchoredRef.data?.anchor_tx_hash ? (
          <div className="mt-2 text-sm text-slate-700">
            <p>TX: {lastAnchoredRef.data.anchor_tx_hash}</p>
            <p>Block: {lastAnchoredRef.data.anchor_block_number}</p>
            <p>Updated: {new Date(lastAnchoredRef.data.updated_at).toLocaleString()}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No anchored referral yet.</p>
        )}
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatusCard({ title, ok, status, endpoint }: { title: string; ok: boolean; status: number; endpoint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className={`mt-2 text-sm ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? 'Healthy' : 'Unhealthy'}</p>
      <p className="mt-1 text-xs text-slate-500">HTTP {status || '-'} • {endpoint}</p>
    </div>
  );
}
