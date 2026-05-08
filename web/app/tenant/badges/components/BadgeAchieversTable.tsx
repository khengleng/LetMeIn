import Link from 'next/link';

type Achiever = {
  donor_telegram_id: string;
  donor_display_name: string | null;
  total_verified_value: string;
  verification_status: string | null;
  badge_link: string | null;
  tier_name: string | null;
  updated_at: string;
};

export function BadgeAchieversTable({ rows }: { rows: Achiever[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Donor</th>
            <th className="px-3 py-2 text-left">Tier</th>
            <th className="px-3 py-2 text-left">Verified Status</th>
            <th className="px-3 py-2 text-left">Total Verified (USD)</th>
            <th className="px-3 py-2 text-left">Badge</th>
            <th className="px-3 py-2 text-left">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.donor_telegram_id}-${row.updated_at}`}>
              <td className="px-3 py-2">
                <p className="font-medium text-slate-900">{row.donor_display_name || `Donor ${row.donor_telegram_id}`}</p>
                <p className="text-xs text-slate-500">TG: {row.donor_telegram_id}</p>
              </td>
              <td className="px-3 py-2">{row.tier_name || 'Explorer'}</td>
              <td className="px-3 py-2">{row.verification_status || 'verified'}</td>
              <td className="px-3 py-2">${Number(row.total_verified_value || 0).toFixed(2)}</td>
              <td className="px-3 py-2">
                {row.badge_link ? (
                  <Link href={row.badge_link} target="_blank" className="text-sky-600 hover:underline">Open</Link>
                ) : (
                  '-'
                )}
              </td>
              <td className="px-3 py-2">{new Date(row.updated_at).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No badge achievers yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
