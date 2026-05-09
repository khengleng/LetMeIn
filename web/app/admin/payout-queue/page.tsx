import Link from 'next/link';
import { adminSupabase } from '../lib/admin-supabase';
import { markCommissionPaid } from '../lib/actions';

export default async function AdminPayoutQueuePage({
  searchParams,
}: {
  searchParams?: { tenant_id?: string };
}) {
  const tenantFilter = searchParams?.tenant_id || '';

  const { data: tenants } = await adminSupabase.from('tenants').select('id,name').order('name', { ascending: true });

  let query = adminSupabase
    .from('commissions')
    .select('id,tenant_id,referral_id,amount,currency,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(500);

  if (tenantFilter) query = query.eq('tenant_id', tenantFilter);

  const { data: pending } = await query;
  const nameById = new Map((tenants || []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin">Dashboard</Link>
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin/rules">Commission Rules</Link>
        <Link className="rounded bg-slate-900 px-3 py-1 text-white" href="/admin/payout-queue">Payout Queue</Link>
      </nav>

      <form className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm">Filter by tenant</label>
        <div className="mt-2 flex gap-2">
          <select name="tenant_id" defaultValue={tenantFilter} className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">All tenants</option>
            {(tenants || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">Apply</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Tenant</th>
              <th className="px-3 py-2 text-left">Referral</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">KHQR Ref</th>
              <th className="px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(pending || []).map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">{nameById.get(row.tenant_id) || row.tenant_id}</td>
                <td className="px-3 py-2">{row.referral_id}</td>
                <td className="px-3 py-2">${Number(row.amount).toFixed(2)}</td>
                <td className="px-3 py-2">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <form action={markCommissionPaid} className="flex gap-2">
                    <input type="hidden" name="commission_id" value={row.id} />
                    <input name="khqr_reference" required className="rounded border border-slate-300 px-2 py-1 text-xs" placeholder="KHQR-REF" />
                    <button className="rounded bg-slate-900 px-2 py-1 text-xs text-white" type="submit">Mark Paid</button>
                  </form>
                </td>
                <td className="px-3 py-2">pending</td>
              </tr>
            ))}
            {(!pending || pending.length === 0) && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No pending commissions.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
