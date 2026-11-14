import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseAccess, type AccessResult } from "./model";
// React cache is request-local. Database guards independently authorize every write.
const activate = cache(async (): Promise<AccessResult | null> => {
  try {
    const client = await createClient({ readOnly: true });
    const identity = await client.auth.getUser();
    if (identity.error)
      return {
        status:
          identity.error.status === 401 ||
          identity.error.status === 403 ||
          identity.error.name === "AuthSessionMissingError"
            ? "unauthenticated"
            : "unavailable",
      };
    if (!identity.data.user) return { status: "unauthenticated" };
    const result = await client.rpc("activate_account_trial");
    return result.error ? { status: "unavailable" } : null;
  } catch {
    return { status: "unavailable" };
  }
});
export const readAccess = cache(
  async (session?: string): Promise<AccessResult> => {
    const failure = await activate();
    if (failure) return failure;
    try {
      const client = await createClient({ readOnly: true });
      const result = await client.rpc("account_access", {
        p_session: session ?? null,
      });
      const decision = result.error ? null : parseAccess(result.data);
      return decision
        ? { status: "ready", decision }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  },
);
