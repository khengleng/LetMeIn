import Link from 'next/link';

export function LanguageToggle({ id, currentLang }: { id: string; currentLang: 'en' | 'kh' }) {
  const isKh = currentLang === 'kh';
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link
        href={`/ref/${id}?lang=en`}
        className={`rounded-full px-3 py-1 ${!isKh ? 'bg-ink text-white' : 'bg-white text-ink'}`}
      >
        EN
      </Link>
      <Link
        href={`/ref/${id}?lang=kh`}
        className={`rounded-full px-3 py-1 ${isKh ? 'bg-ink text-white' : 'bg-white text-ink'}`}
      >
        KH
      </Link>
    </div>
  );
}
