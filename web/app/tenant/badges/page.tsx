import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { BadgeAchieversTable } from './components/BadgeAchieversTable';

export const dynamic = 'force-dynamic';

function getAdminDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getTenantContext() {
  const adminDb = getAdminDb();
  const authJwt = process.env.TENANT_SERVER_AUTH_JWT || '';
  if (!authJwt) throw new Error('Missing TENANT_SERVER_AUTH_JWT');

  const anon = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authJwt}` } },
  });

  const { data, error } = await anon.auth.getUser();
  if (error || !data.user?.id) throw new Error('Tenant authentication required');

  const { data: tenant } = await adminDb.from('tenants').select('id,name').eq('id', data.user.id).single();
  if (!tenant) throw new Error('Tenant context not found');

  return tenant;
}

export default async function TenantBadgesPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const adminDb = getAdminDb();
  const tenant = await getTenantContext();
  const q = (searchParams?.q || '').trim().toLowerCase();

  const [tiersRes, badgesRes] = await Promise.all([
    adminDb
      .from('badge_tiers')
      .select('id,tier_name,rank,min_verified_value,is_active')
      .eq('tenant_id', tenant.id)
      .order('rank', { ascending: true }),
    adminDb
      .from('donor_badges')
      .select('donor_telegram_id,donor_display_name,total_verified_value,verification_status,badge_link,current_tier_id,updated_at')
      .eq('tenant_id', tenant.id)
      .order('updated_at', { ascending: false })
      .limit(1000),
  ]);

  const tierMap = new Map((tiersRes.data || []).map((t) => [t.id, t.tier_name]));

  const achievers = (badgesRes.data || []).map((b) => ({
    ...b,
    tier_name: b.current_tier_id ? tierMap.get(b.current_tier_id) || 'Explorer' : 'Explorer',
  }));

  const filtered = q
    ? achievers.filter((a) => {
        const n = (a.donor_display_name || '').toLowerCase();
        const t = (a.tier_name || '').toLowerCase();
        return n.includes(q) || String(a.donor_telegram_id).includes(q) || t.includes(q);
      })
    : achievers;

  const totalDonors = achievers.length;
  const verifiedDonors = achievers.filter((a) => (a.verification_status || 'verified') === 'verified').length;
  const totalVerifiedUsd = achievers.reduce((sum, a) => sum + Number(a.total_verified_value || 0), 0);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded bg-white px-3 py-1 text-slate-700" href="/tenant/rules">Referral Rules</Link>
        <Link className="rounded bg-slate-900 px-3 py-1 text-white" href="/tenant/badges">Charity Badges</Link>
      </nav>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="Total Donors with Badges" value={`${totalDonors}`} />
        <Kpi label="Verified Donors" value={`${verifiedDonors}`} />
        <Kpi label="Total Verified Donations" value={`$${totalVerifiedUsd.toFixed(2)}`} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Badge Tiers</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
          {(tiersRes.data || []).map((tier) => (
            <div key={tier.id} className="rounded border border-slate-200 p-3 text-xs">
              <p className="font-semibold text-slate-900">{tier.tier_name}</p>
              <p className="mt-1 text-slate-600">Rank: {tier.rank}</p>
              <p className="text-slate-600">Threshold: ${Number(tier.min_verified_value).toFixed(2)}</p>
              <p className="text-slate-600">{tier.is_active ? 'active' : 'inactive'}</p>
            </div>
          ))}
          {(tiersRes.data || []).length === 0 && <p className="text-xs text-slate-500">No tiers configured yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <form className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="text-xs text-slate-600">Search Donors</label>
          <div className="mt-2 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Name, Telegram ID, or tier" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Search</button>
          </div>
        </form>

        <BadgeAchieversTable rows={filtered} />
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
