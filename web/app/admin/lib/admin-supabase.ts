import 'server-only';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  trial_ends_at: string;
  created_at: string;
};

export type AdminBillingPayment = {
  id: string;
  tenant_id: string;
  billing_month: string;
  amount_usd: string;
  currency: string;
  method: 'khqr' | 'cash' | 'bank_transfer';
  status: 'pending' | 'confirmed' | 'rejected';
  paid_at: string | null;
  reference_code: string | null;
  notes: string | null;
  created_at: string;
};
