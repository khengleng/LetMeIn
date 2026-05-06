import type { ChainVerification } from '@/lib/verify-chain';

export function VerificationBadge({
  chain,
  verifiedLabel,
  unverifiedLabel,
}: {
  chain: ChainVerification;
  verifiedLabel: string;
  unverifiedLabel: string;
}) {
  if (!chain.isVerified) {
    return <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{unverifiedLabel}</span>;
  }

  return (
    <a
      href={chain.explorerUrl || '#'}
      target="_blank"
      rel="noreferrer"
      className="inline-flex rounded-full bg-mint px-3 py-1 text-xs font-semibold text-white"
    >
      ✅ {verifiedLabel}
    </a>
  );
}
