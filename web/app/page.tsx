import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">LetMeIn</h1>
      <p className="mt-2 text-sm text-slate-600">Production web service is online.</p>
      <div className="mt-4 flex gap-3">
        <Link href="/admin" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Open Admin</Link>
      </div>
    </main>
  );
}
