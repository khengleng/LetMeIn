'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveScheme } from '../saveScheme';

type Scheme = {
  commission_type: 'percent' | 'fixed';
  commission_value: number;
  discount_type: 'percent' | 'fixed' | 'free_shipping';
  discount_value: number;
  conversion_event: 'signup' | 'first_purchase' | 'deposit';
  min_purchase_amount: number;
  max_commissions_per_month: number;
  is_active: boolean;
};

export function SchemeForm({ initial }: { initial: Scheme }) {
  const [form, setForm] = useState<Scheme>(initial);
  const [message, setMessage] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [pending, startTransition] = useTransition();

  const validation = useMemo(() => {
    if (form.commission_type === 'percent' && (form.commission_value < 0 || form.commission_value > 100)) return 'Commission % must be 0..100';
    if (form.commission_type === 'fixed' && (form.commission_value < 0 || form.commission_value > 1000)) return 'Commission fixed must be 0..1000 USD';
    if (form.discount_type === 'percent' && (form.discount_value < 0 || form.discount_value > 100)) return 'Discount % must be 0..100';
    if (form.discount_type === 'fixed' && (form.discount_value < 0 || form.discount_value > 500)) return 'Discount fixed must be 0..500 USD';
    if (form.discount_type === 'free_shipping' && form.discount_value !== 0) return 'Free shipping requires discount value 0';
    if (form.max_commissions_per_month < 1 || form.max_commissions_per_month > 500) return 'Monthly cap must be 1..500';
    if (form.min_purchase_amount < 0) return 'Min purchase must be >= 0';
    return '';
  }, [form]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validation) {
      setMessage(validation);
      return;
    }

    const fd = new FormData();
    fd.set('commission_type', form.commission_type);
    fd.set('commission_value', String(form.commission_value));
    fd.set('discount_type', form.discount_type);
    fd.set('discount_value', String(form.discount_value));
    fd.set('conversion_event', form.conversion_event);
    fd.set('min_purchase_amount', String(form.min_purchase_amount));
    fd.set('max_commissions_per_month', String(form.max_commissions_per_month));
    fd.set('is_active', String(form.is_active));

    startTransition(async () => {
      try {
        await saveScheme(fd);
        setMessage('Saved successfully');
      } catch (err) {
        setMessage((err as Error).message || 'Save failed');
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Referral Scheme</h2>
        <button type="button" onClick={() => setShowPreview(true)} className="rounded border border-slate-300 px-2 py-1 text-xs">Preview How It Works</button>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-600">
          Commission Type
          <select className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.commission_type} onChange={(e) => setForm((v) => ({ ...v, commission_type: e.target.value as Scheme['commission_type'] }))}>
            <option value="percent">percent</option>
            <option value="fixed">fixed</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Commission Value (USD or %)
          <input type="number" step="0.01" className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.commission_value} onChange={(e) => setForm((v) => ({ ...v, commission_value: Number(e.target.value) }))} />
        </label>

        <label className="text-xs text-slate-600">
          Discount Type
          <select className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.discount_type} onChange={(e) => setForm((v) => ({ ...v, discount_type: e.target.value as Scheme['discount_type'] }))}>
            <option value="percent">percent</option>
            <option value="fixed">fixed</option>
            <option value="free_shipping">free_shipping</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Discount Value (USD or %)
          <input type="number" step="0.01" className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.discount_value} onChange={(e) => setForm((v) => ({ ...v, discount_value: Number(e.target.value) }))} />
        </label>

        <label className="text-xs text-slate-600">
          Conversion Trigger
          <select className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.conversion_event} onChange={(e) => setForm((v) => ({ ...v, conversion_event: e.target.value as Scheme['conversion_event'] }))}>
            <option value="signup">signup</option>
            <option value="first_purchase">first_purchase</option>
            <option value="deposit">deposit</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Monthly Commission Cap
          <input type="number" className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.max_commissions_per_month} onChange={(e) => setForm((v) => ({ ...v, max_commissions_per_month: Number(e.target.value) }))} />
        </label>

        <label className="text-xs text-slate-600">
          Minimum Purchase Amount (USD)
          <input type="number" step="0.01" className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={form.min_purchase_amount} onChange={(e) => setForm((v) => ({ ...v, min_purchase_amount: Number(e.target.value) }))} />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((v) => ({ ...v, is_active: e.target.checked }))} />
          Scheme is active
        </label>

        <div className="md:col-span-2 flex items-center gap-2">
          <button disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">{pending ? 'Saving...' : 'Save Scheme'}</button>
          {message && <p className="text-xs text-slate-600">{message}</p>}
        </div>
      </form>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4">
            <h3 className="text-sm font-semibold">Preview How It Works</h3>
            <p className="mt-2 text-sm text-slate-700">
              Referrer reward: {form.commission_type === 'fixed' ? `$${form.commission_value.toFixed(2)}` : `${form.commission_value.toFixed(2)}%`}.
              New customer reward: {form.discount_type === 'free_shipping' ? 'Free shipping' : form.discount_type === 'fixed' ? `$${form.discount_value.toFixed(2)} off` : `${form.discount_value.toFixed(2)}% off`}.
            </p>
            <p className="mt-2 text-xs text-slate-500">Trigger: {form.conversion_event}. Monthly cap: {form.max_commissions_per_month} commissions.</p>
            <button onClick={() => setShowPreview(false)} className="mt-4 rounded bg-slate-900 px-3 py-2 text-xs text-white">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
