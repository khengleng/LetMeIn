import Link from 'next/link';
import { getAdminSupabase } from './lib/admin-supabase';
import { WeeklyReferralsChart } from './lib/charts';
import { requireOperator } from './lib/auth-guard';

function percent(numerator: number, denominator: number) {
  if (!denominator) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function AdminDashboardPage() {
  const adminSupabase = getAdminSupabase();
  await requireOperator();
  const now = new Date();
  const trialWindowEnd = new Date(now);
  trialWindowEnd.setDate(now.getDate() + 7);

  const [
    tenantsRes,
    activeTenantsRes,
    referralsRes,
    payoutsRes,
    trialExpiringRes,
    billingRes,
    weeklyRes,
  ] = await Promise.all([
    adminSupabase.from('tenants').select('id,status', { count: 'exact', head: true }),
    adminSupabase.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    adminSupabase.from('referrals').select('id', { count: 'exact', head: true }),
    adminSupabase.from('payouts').select('id,status', { count: 'exact' }),
    adminSupabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'trial')
      .lte('trial_ends_at', trialWindowEnd.toISOString()),
    adminSupabase
      .from('billing_payments')
      .select('amount_usd,status,paid_at')
      .eq('status', 'confirmed')
      .gte('paid_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString()),
    adminSupabase
      .from('referrals')
      .select('occurred_at')
      .gte('occurred_at', new Date(now.getTime() - 1000 * 60 * 60 * 24 * 56).toISOString())
      .order('occurred_at', { ascending: true }),
  ]);

  const activeTenants = activeTenantsRes.count || 0;
  const totalTenants = tenantsRes.count || 0;
  const totalReferrals = referralsRes.count || 0;
  const trialExpiring = trialExpiringRes.count || 0;

  const paidThisMonth = (billingRes.data || []).reduce((sum, item) => sum + Number(item.amount_usd || 0), 0);
  const totalPayouts = payoutsRes.data || [];
  const paidPayouts = totalPayouts.filter((p) => p.status === 'paid').length;

  const weeklyBuckets = new Map<string, number>();
  for (const row of weeklyRes.data || []) {
    const d = new Date(row.occurred_at);
    const key = `${d.getUTCFullYear()}-W${String(Math.ceil((d.getUTCDate() + 6) / 7)).padStart(2, '0')}`;
    weeklyBuckets.set(key, (weeklyBuckets.get(key) || 0) + 1);
  }

  const weeklyData = Array.from(weeklyBuckets.entries())
    .map(([week, referrals]) => ({ week, referrals }))
    .slice(-8);

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded bg-slate-900 px-3 py-1 text-white" href="/admin">Dashboard</Link>
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin/tenants">Tenants</Link>
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin/billing">Billing</Link>
      </nav>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="MRR (USD)" value={`$${paidThisMonth.toFixed(2)}`} />
        <KpiCard label="Active Tenants" value={`${activeTenants}`} />
        <KpiCard label="Total Referrals" value={`${totalReferrals}`} />
        <KpiCard label="Conversion Rate" value={percent(activeTenants, totalTenants)} />
        <KpiCard label="Trials Expiring (7d)" value={`${trialExpiring}`} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Weekly Referrals (8 weeks)</h2>
          <WeeklyReferralsChart data={weeklyData} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Payout Snapshot</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Total Payout Records</dt><dd>{totalPayouts.length}</dd></div>
            <div className="flex justify-between"><dt>Paid</dt><dd>{paidPayouts}</dd></div>
            <div className="flex justify-between"><dt>Pending</dt><dd>{totalPayouts.length - paidPayouts}</dd></div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
