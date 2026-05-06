import { notFound } from 'next/navigation';
import { LanguageToggle } from '@/components/LanguageToggle';
import { VerificationBadge } from '@/components/VerificationBadge';
import { formatDate, maskReferee } from '@/lib/format';
import { detectLang, getCopy } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { verifyTx } from '@/lib/verify-chain';

type ReferralRecord = {
  id: string;
  referrer_code: string;
  referee_phone_hash: string;
  occurred_at: string;
  source: string;
  metadata: {
    campaign?: string;
    status?: string;
    anchor_tx_hash?: string;
  } | null;
};

async function getReferralById(id: string): Promise<ReferralRecord | null> {
  const { data, error } = await supabase
    .from('referrals')
    .select('id, referrer_code, referee_phone_hash, occurred_at, source, metadata')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as ReferralRecord;
}

export default async function ReferralVerifyPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}) {
  const lang = detectLang(searchParams.lang);
  const copy = getCopy(lang);

  if (!params.id) notFound();

  const referral = await getReferralById(params.id);
  if (!referral) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl p-4 sm:p-6">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">{copy.title}</h1>
            <LanguageToggle id={params.id} currentLang={lang} />
          </div>
          <p className="mt-6 text-sm text-slate-600">{copy.missing}</p>
        </section>
      </main>
    );
  }

  const txHash = referral.metadata?.anchor_tx_hash ?? null;
  const chain = await verifyTx(txHash);

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl p-4 sm:p-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
          </div>
          <LanguageToggle id={params.id} currentLang={lang} />
        </div>

        <div className="mt-5">
          <VerificationBadge
            chain={chain}
            verifiedLabel={copy.polygonVerified}
            unverifiedLabel={copy.polygonUnverified}
          />
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{copy.fields.referrerCode}</dt>
            <dd className="font-medium">{referral.referrer_code}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{copy.fields.referee}</dt>
            <dd className="font-medium">{maskReferee(referral.referee_phone_hash)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{copy.fields.campaign}</dt>
            <dd className="font-medium">{referral.metadata?.campaign || referral.source || 'N/A'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{copy.fields.date}</dt>
            <dd className="font-medium">{formatDate(referral.occurred_at, lang)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{copy.fields.status}</dt>
            <dd className="font-medium">{referral.metadata?.status || 'recorded'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">{copy.fields.txHash}</dt>
            <dd className="font-medium break-all">
              {chain.explorerUrl && chain.txHash ? (
                <a href={chain.explorerUrl} target="_blank" rel="noreferrer">
                  {chain.txHash}
                </a>
              ) : (
                'N/A'
              )}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
