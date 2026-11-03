import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions, getSupabaseConfig } from "./config";
// Components read only; middleware persists refreshes. Actions and handlers may write.
export async function createClient({
  readOnly = false,
  responseHeaders,
}: { readOnly?: boolean; responseHeaders?: Headers } = {}) {
  const { url, key } = getSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(),
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values, cacheHeaders) => {
        if (readOnly) return; // Request middleware owns refresh cookie/header writes for RSCs.
        for (const { name, value, options } of values)
          cookieStore.set(name, value, options);
        for (const [name, value] of Object.entries(cacheHeaders))
          responseHeaders?.set(name, value);
      },
    },
  });
}
