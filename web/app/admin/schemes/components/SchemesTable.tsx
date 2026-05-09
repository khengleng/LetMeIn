import { getSchemeAuditHistory } from '@/lib/schemes/audit';
import { overrideScheme } from '../overrideScheme';

type Row = {
  tenant_id: string;
  tenant_name: string;
  commission_type: string;
  commission_value: number;
  discount_type: string;
  discount_value: number;
  max_commissions_per_month: number;
  is_active: boolean;
  month_commission_count: number;
};

export async function SchemesTable({ rows }: { rows: Row[] }) {
  const auditsByTenant = new Map<string, Awaited<ReturnType<typeof getSchemeAuditHistory>>>();
  await Promise.all(
    rows.map(async (row) => {
      const audits = await getSchemeAuditHistory(row.tenant_id, 5);
      auditsByTenant.set(row.tenant_id, audits);
    }),
  );

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const audits = auditsByTenant.get(row.tenant_id) || [];
        const nearingCap = row.month_commission_count >= Math.floor(row.max_commissions_per_month * 0.8);
        const highCommission = row.commission_type === 'percent' ? row.commission_value >= 30 : row.commission_value >= 50;

        return (
          <div key={row.tenant_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{row.tenant_name}</h3>
                <p className="text-xs text-slate-500">Tenant ID: {row.tenant_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge label={row.is_active ? 'active' : 'inactive'} tone={row.is_active ? 'green' : 'gray'} />
                {highCommission && <Badge label="high commission" tone="amber" />}
                {nearingCap && <Badge label="nearing cap" tone="rose" />}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-4">
              <p>Commission: {row.commission_type} {row.commission_value}</p>
              <p>Discount: {row.discount_type} {row.discount_value}</p>
              <p>Monthly cap: {row.max_commissions_per_month}</p>
              <p>Used this month: {row.month_commission_count}</p>
            </div>

            <form action={overrideScheme} className="mt-3 flex gap-2">
              <input type="hidden" name="tenant_id" value={row.tenant_id} />
              <input name="reason" required className="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="Override reason" />
              <button className="rounded bg-rose-600 px-3 py-1 text-xs text-white" type="submit">Override</button>
            </form>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-600">Recent audit history</summary>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                {audits.map((a) => (
                  <div key={a.id} className="rounded bg-slate-50 p-2">
                    <p>{new Date(a.created_at).toLocaleString()} - {a.action} by {a.actor_email}</p>
                    {a.reason && <p>Reason: {a.reason}</p>}
                  </div>
                ))}
                {audits.length === 0 && <p>No audit records.</p>}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: 'green' | 'gray' | 'amber' | 'rose' }) {
  const map = {
    green: 'bg-emerald-100 text-emerald-800',
    gray: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-800',
  };
  return <span className={`rounded px-2 py-0.5 text-[11px] ${map[tone]}`}>{label}</span>;
}
