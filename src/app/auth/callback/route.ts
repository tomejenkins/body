import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authConfigured, getSiteOrigin } from "@/lib/supabase/config";
import { callbackNext } from "@/features/auth/validation";
export async function GET(request: NextRequest) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  const origin = authConfigured() ? getSiteOrigin() : request.nextUrl.origin;
  const fail = () =>
    NextResponse.redirect(new URL("/login?error=callback", origin), {
      headers,
    });
  if (!authConfigured()) return fail();
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  try {
    const client = await createClient({ responseHeaders: headers });
    if (code) {
      const result = await client.auth.exchangeCodeForSession(code);
      if (result.error) return fail();
    } else if (tokenHash && (type === "signup" || type === "recovery")) {
      const result = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (result.error) return fail();
    } else return fail();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user) return fail();
    const destination =
      type === "recovery"
        ? "/reset-password"
        : callbackNext(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(destination, origin), { headers });
  } catch {
    return fail();
  }
}
