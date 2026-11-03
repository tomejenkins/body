import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  authConfigured,
  authCookieOptions,
  getSupabaseConfig,
  getSiteOrigin,
} from "./config";
import { isProtectedPath, safeNext } from "@/features/auth/validation";
export async function updateSession(request: NextRequest) {
  request.headers.set(
    "x-body-next",
    safeNext(request.nextUrl.pathname + request.nextUrl.search),
  );
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  let authenticated = false;
  if (authConfigured()) {
    const { url, key } = getSupabaseConfig();
    const client = createServerClient(url, key, {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, headers) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          const existing = response.cookies.getAll();
          const previousHeaders = new Headers(response.headers);
          response = NextResponse.next({ request });
          existing.forEach((cookie) => response.cookies.set(cookie));
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          for (const name of ["cache-control", "expires", "pragma"]) {
            const value = previousHeaders.get(name);
            if (value) response.headers.set(name, value);
          }
          for (const [name, value] of Object.entries(headers))
            response.headers.set(name, value);
        },
      },
    });
    try {
      const { data, error } = await client.auth.getUser();
      authenticated = !error && !!data.user;
    } catch {
      authenticated = false;
    }
  }
  const path = request.nextUrl.pathname;
  let location: URL | undefined;
  if (!authenticated && (isProtectedPath(path) || path === "/onboarding")) {
    location = new URL(
      "/login",
      authConfigured() ? getSiteOrigin() : request.nextUrl.origin,
    );
    location.searchParams.set(
      "next",
      safeNext(request.nextUrl.pathname + request.nextUrl.search),
    );
  }
  if (location) {
    const redirected = NextResponse.redirect(location);
    response.cookies
      .getAll()
      .forEach((cookie) => redirected.cookies.set(cookie));
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) redirected.headers.set(name, value);
    }
    return redirected;
  }
  return response;
}
