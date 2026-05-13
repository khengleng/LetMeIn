import Link from 'next/link';

export const dynamic = 'force-dynamic';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/tenants', label: 'Tenants' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/health', label: 'Health' },
  { href: '/admin/rules', label: 'Rules' },
  { href: '/admin/payout-queue', label: 'Payout Queue' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">LetMeIn Operator Portal</h1>
            <p className="text-xs text-slate-500">Platform-owner access only</p>
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-100">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
