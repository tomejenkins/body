export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Configure the public Supabase URL and publishable key before using Supabase.",
    );
  return { url, key };
}
export function getSiteOrigin() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value)
    throw new Error(
      "Configure NEXT_PUBLIC_SITE_URL before using authentication.",
    );
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "The site URL must be an HTTPS origin, or HTTP localhost for local development.",
    );
  return url.origin;
}
export function authConfigured() {
  try {
    getSupabaseConfig();
    getSiteOrigin();
    return true;
  } catch {
    return false;
  }
}
export function authCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: getSiteOrigin().startsWith("https:"),
  };
}
