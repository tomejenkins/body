import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { BillingConfig, Plan } from "./config";
export type BillingAccount = {
  owner_id: string;
  mode: string;
  customer_id: string | null;
  customer_operation: string;
  customer_started_at: string | null;
  checkout_operation: string;
  checkout_started_at: string | null;
  checkout_plan: Plan | null;
  checkout_id: string | null;
  lease_token: string;
  has_lifetime: boolean;
  customer_retry_safe: boolean;
  checkout_retry_safe: boolean;
  refresh_allowed: boolean;
  duplicate?: boolean;
};
export type PaidPeriod = {
  reference: string;
  invoice: string;
  start: string;
  end: string;
  revoked: boolean;
};
export type SubscriptionSnapshot = {
  id: string;
  price: string;
  plan: Plan;
  status: string;
  start: string;
  end: string;
  cancelAtEnd: boolean;
  cancelAt: string | null;
};
export class BillingDatabase {
  private client;
  constructor(private config: BillingConfig) {
    this.client = createClient(getSupabaseConfig().url, config.databaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error("Billing database unavailable.");
    return data;
  }
  async lookup(customer: string): Promise<string | null> {
    return this.rpc("billing_lookup_customer", {
      p_customer: customer,
      p_mode: this.config.mode,
    });
  }
  async claim(
    owner: string,
    event?: { id: string; type: string; object: string },
  ): Promise<BillingAccount> {
    return this.rpc("billing_claim", {
      p_owner: owner,
      p_mode: this.config.mode,
      p_event: event ?? null,
    });
  }
  async commit(
    account: BillingAccount,
    change: Record<string, unknown>,
    event?: string,
  ) {
    await this.rpc("billing_commit", {
      p_owner: account.owner_id,
      p_mode: this.config.mode,
      p_token: account.lease_token,
      p_change: change,
      p_event: event ?? null,
    });
  }
}
