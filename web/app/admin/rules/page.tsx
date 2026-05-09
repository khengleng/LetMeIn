import Link from 'next/link';
import { adminSupabase } from '../lib/admin-supabase';
import { updateCommissionRules } from '../lib/actions';

export default async function AdminRulesPage() {
  const { data: tenants } = await adminSupabase
    .from('tenants')
    .select('id,name,commission_type,commission_value,discount_type,discount_value')
    .order('name', { ascending: true });

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin">Dashboard</Link>
        <Link className="rounded bg-slate-900 px-3 py-1 text-white" href="/admin/rules">Commission Rules</Link>
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/admin/payout-queue">Payout Queue</Link>
      </nav>

      <div className="space-y-3">
        {(tenants || []).map((tenant) => (
          <form key={tenant.id} action={updateCommissionRules} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{tenant.name}</h2>
              <input type="hidden" name="tenant_id" value={tenant.id} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <select name="commission_type" defaultValue={tenant.commission_type} className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
              <input name="commission_value" type="number" step="0.01" min="0" defaultValue={tenant.commission_value} className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <select name="discount_type" defaultValue={tenant.discount_type} className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
              <input name="discount_value" type="number" step="0.01" min="0" defaultValue={tenant.discount_value} className="rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="mt-3 rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white">Save Rules</button>
          </form>
        ))}
      </div>
    </div>
  );
}
