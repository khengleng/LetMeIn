import { requireOperator } from './lib/auth-guard';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperator();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">LetMeIn Operator Portal</h1>
            <p className="text-xs text-slate-500">Restricted to platform operators</p>
          </div>
          <p className="text-sm text-slate-700">{operator.email}</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
