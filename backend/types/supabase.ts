export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          status: 'trial' | 'active' | 'suspended' | 'cancelled';
          trial_ends_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          status?: 'trial' | 'active' | 'suspended' | 'cancelled';
          trial_ends_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          status?: 'trial' | 'active' | 'suspended' | 'cancelled';
          trial_ends_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          tenant_id: string;
          timezone: string;
          bot_display_name: string | null;
          khqr_account_name: string | null;
          khqr_payload: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          timezone?: string;
          bot_display_name?: string | null;
          khqr_account_name?: string | null;
          khqr_payload?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          timezone?: string;
          bot_display_name?: string | null;
          khqr_account_name?: string | null;
          khqr_payload?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'settings_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      referrals: {
        Row: {
          id: string;
          tenant_id: string;
          referrer_code: string;
          referee_phone_hash: string;
          occurred_at: string;
          referral_hash: string;
          source: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          referrer_code: string;
          referee_phone_hash: string;
          occurred_at: string;
          referral_hash: string;
          source?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          referrer_code?: string;
          referee_phone_hash?: string;
          occurred_at?: string;
          referral_hash?: string;
          source?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referrals_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      payouts: {
        Row: {
          id: string;
          tenant_id: string;
          week_start: string;
          week_end: string;
          referral_count: number;
          amount_usd: string;
          status: 'pending' | 'processing' | 'paid' | 'failed';
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          week_start: string;
          week_end: string;
          referral_count?: number;
          amount_usd?: string;
          status?: 'pending' | 'processing' | 'paid' | 'failed';
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          week_start?: string;
          week_end?: string;
          referral_count?: number;
          amount_usd?: string;
          status?: 'pending' | 'processing' | 'paid' | 'failed';
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payouts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_tenant_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_tenant_in_trial_or_active: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
