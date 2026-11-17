import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
export type BillingSummary = {
  lifetime: boolean;
  hasCustomer: boolean;
  subscriptions: {
    plan: "monthly" | "annual";
    status: string;
    periodEnd: string;
    cancelAtEnd: boolean;
    mode: string;
  }[];
};
export const readBilling = cache(async (): Promise<BillingSummary | null> => {
  try {
    const client = await createClient({ readOnly: true });
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user) return null;
    const result = await client.rpc("billing_summary");
    if (
      result.error ||
      !result.data ||
      typeof result.data.lifetime !== "boolean" ||
      !Array.isArray(result.data.subscriptions)
    )
      return null;
    return result.data as BillingSummary;
  } catch {
    return null;
  }
});
