import 'server-only';

import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function getSchemeAuditHistory(tenantId: string, limit = 50) {
  const { data, error } = await db
    .from('scheme_audit_logs')
    .select('id,actor_email,action,old_values,new_values,reason,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}
