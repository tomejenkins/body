export type AuthState = { error?: string; success?: string };
export const initialAuthState: AuthState = {};
export function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
export function validateEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
export function validatePassword(value: string) {
  return (
    Array.from(value).length >= 12 &&
    new TextEncoder().encode(value).length <= 72
  );
}
export function validateRegistration(
  email: string,
  password: string,
  confirmation: string,
): string | undefined {
  if (!validateEmail(email)) return "Enter a valid email address.";
  if (!validatePassword(password))
    return "Use a password with at least 12 characters. If it is very long, try a shorter passphrase.";
  if (password !== confirmation) return "The passwords do not match.";
}
const roots = [
  "/dashboard",
  "/workout",
  "/programs",
  "/history",
  "/feed",
  "/profile",
  "/exercises",
];
export function isProtectedPath(path: string) {
  return roots.some((root) => path === root || path.startsWith(root + "/"));
}
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    if (
      !value.startsWith("/") ||
      decoded.startsWith("//") ||
      /[\\\x00-\x1f\x7f]/.test(decoded)
    )
      return "/dashboard";
    const url = new URL(value, "https://body.invalid");
    if (url.origin !== "https://body.invalid" || !isProtectedPath(url.pathname))
      return "/dashboard";
    return url.pathname + url.search;
  } catch {
    return "/dashboard";
  }
}
export function callbackNext(value: unknown) {
  return value === "/reset-password" ? value : safeNext(value);
}
