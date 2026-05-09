import Link from 'next/link';
import { adminSupabase } from '../lib/admin-supabase';
import { exportBillingCsv, recordManualPayment } from '../lib/actions';

const TIERS = [
  { name: 'Starter', price: 9 },
  { name: 'Growth', price: 29 },
  { name: 'Scale', price: 79 },
];

export default async function AdminBillingPage() {
  const [tenantsRes, paymentsRes, trialTenantsRes] = await Promise.all([
    adminSupabase.from('tenants').select('id,name,status,trial_ends_at').order('name', { ascending: true }),
    adminSupabase
      .from('billing_payments')
      .select('id,tenant_id,billing_month,amount_usd,currency,method,status,paid_at,reference_code,notes,created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    adminSupabase.from('tenants').select('id,name,trial_ends_at').eq('status', 'trial').order('trial_ends_at', { ascending: true }),
  ]);

  const tenants = tenantsRes.data || [];
  const payments = paymentsRes.data || [];

  const now = Date.now();
  const expiredTrials = (trialTenantsRes.data || []).filter((t) => new Date(t.trial_ends_at).getTime() < now);

  const csv = await exportBillingCsv();
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  const tenantNameById = new Map(tenants.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin">Dashboard</Link>
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin/tenants">Tenants</Link>
        <Link className="rounded bg-slate-900 px-3 py-1 text-white" href="/admin/billing">Billing</Link>
      </nav>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Subscription Tiers</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {TIERS.map((tier) => (
              <li key={tier.name} className="flex justify-between">
                <span>{tier.name}</span>
                <span>${tier.price}/month</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-amber-900">Expired Trials (Auto-Flag)</h2>
          <p className="mt-2 text-sm text-amber-800">{expiredTrials.length} trial tenants are past trial end date.</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {expiredTrials.slice(0, 8).map((t) => (
              <li key={t.id}>{t.name} - {new Date(t.trial_ends_at).toLocaleDateString()}</li>
            ))}
            {expiredTrials.length === 0 && <li>No expired trials right now.</li>}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Record Manual KHQR Payment</h2>
        <form action={recordManualPayment} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select name="tenant_id" required className="rounded border border-slate-300 px-3 py-2 text-sm xl:col-span-2">
            <option value="">Select tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input name="billing_month" type="date" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="amount_usd" type="number" step="0.01" min="1" required className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Amount USD" />
          <input name="reference_code" className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="KHQR Ref" />
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Record Payment</button>
          <input type="hidden" name="method" value="khqr" />
          <input name="notes" className="rounded border border-slate-300 px-3 py-2 text-sm xl:col-span-3" placeholder="Notes" />
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Billing History</h2>
          <a href={csvHref} download={`letmein-billing-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded bg-slate-900 px-3 py-1 text-xs text-white">
            Export CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Billing Month</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Paid At</th>
                <th className="px-3 py-2 text-left">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">{tenantNameById.get(p.tenant_id) || p.tenant_id}</td>
                  <td className="px-3 py-2">{p.billing_month}</td>
                  <td className="px-3 py-2">${p.amount_usd}</td>
                  <td className="px-3 py-2">{p.status}</td>
                  <td className="px-3 py-2">{p.paid_at ? new Date(p.paid_at).toLocaleString() : '-'}</td>
                  <td className="px-3 py-2">{p.reference_code || '-'}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No payments yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
