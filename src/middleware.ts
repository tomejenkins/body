import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/update-session";
// Edge middleware is retained for the pinned Cloudflare adapter: Node Proxy support
// is experimental there. Server layouts/actions independently verify identity.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/workout/:path*",
    "/programs/:path*",
    "/history/:path*",
    "/feed/:path*",
    "/profile/:path*",
    "/onboarding",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
  ],
};
