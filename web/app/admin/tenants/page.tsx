import Link from 'next/link';
import { adminSupabase } from '../lib/admin-supabase';
import { updateTenantStatus } from '../lib/actions';

type SearchParams = {
  q?: string;
  status?: string;
};

const statuses = ['trial', 'active', 'suspended', 'cancelled'] as const;

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = (searchParams.q || '').trim();
  const statusFilter = (searchParams.status || '').trim();

  let query = adminSupabase
    .from('tenants')
    .select('id,name,slug,status,trial_ends_at,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter && statuses.includes(statusFilter as (typeof statuses)[number])) {
    query = query.eq('status', statusFilter);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data: tenants } = await query;
  const tenantIds = (tenants || []).map((t) => t.id);

  const [{ data: payments }, { data: referralCounts }] = await Promise.all([
    tenantIds.length
      ? adminSupabase
          .from('billing_payments')
          .select('tenant_id,amount_usd,status,paid_at')
          .in('tenant_id', tenantIds)
          .order('paid_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ tenant_id: string; amount_usd: string; status: string; paid_at: string | null }> }),
    tenantIds.length
      ? adminSupabase.from('referrals').select('tenant_id').in('tenant_id', tenantIds)
      : Promise.resolve({ data: [] as Array<{ tenant_id: string }> }),
  ]);

  const countByTenant = new Map<string, number>();
  for (const row of referralCounts || []) {
    countByTenant.set(row.tenant_id, (countByTenant.get(row.tenant_id) || 0) + 1);
  }

  const latestPaymentByTenant = new Map<string, string>();
  for (const p of payments || []) {
    if (!latestPaymentByTenant.has(p.tenant_id)) {
      latestPaymentByTenant.set(p.tenant_id, p.paid_at || 'pending');
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin">Dashboard</Link>
        <Link className="rounded bg-slate-900 px-3 py-1 text-white" href="/admin/tenants">Tenants</Link>
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin/billing">Billing</Link>
      </nav>

      <form className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Search by name or slug" className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
        <select name="status" defaultValue={statusFilter} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Tenant</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Referrals</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Trial Ends</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Last Payment</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Update Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(tenants || []).map((tenant) => (
              <tr key={tenant.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{tenant.name}</p>
                  <p className="text-xs text-slate-500">{tenant.slug}</p>
                </td>
                <td className="px-4 py-3">{tenant.status}</td>
                <td className="px-4 py-3">{countByTenant.get(tenant.id) || 0}</td>
                <td className="px-4 py-3">{new Date(tenant.trial_ends_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">{latestPaymentByTenant.get(tenant.id) || 'none'}</td>
                <td className="px-4 py-3">
                  <form action={updateTenantStatus} className="flex items-center gap-2">
                    <input type="hidden" name="tenant_id" value={tenant.id} />
                    <select name="status" defaultValue={tenant.status} className="rounded border border-slate-300 px-2 py-1 text-sm">
                      {statuses.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button className="rounded bg-slate-900 px-2 py-1 text-xs text-white" type="submit">Save</button>
                  </form>
                </td>
              </tr>
            ))}
            {(!tenants || tenants.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No tenants found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
