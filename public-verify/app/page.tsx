import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl p-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">LetMeIn Public Verify</h1>
        <p className="mt-2 text-sm text-slate-600">
          Open a referral verification URL in the format:
        </p>
        <p className="mt-1 rounded bg-slate-100 p-2 text-sm">/ref/&lt;referral_id&gt;?lang=en</p>
        <div className="mt-4">
          <Link href="/ref/demo-id?lang=en" className="text-sm">
            View demo route
          </Link>
        </div>
      </div>
    </main>
  );
}
