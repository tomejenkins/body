import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";
import { safeNext } from "./validation";
export async function verifiedUser() {
  if (!authConfigured()) return null;
  try {
    const client = await createClient({ readOnly: true });
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  } // A transport failure never authorizes a private response.
}
export async function requireUser(next = "/dashboard") {
  const user = await verifiedUser();
  if (!user) redirect("/login?next=" + encodeURIComponent(safeNext(next)));
  return user;
}
