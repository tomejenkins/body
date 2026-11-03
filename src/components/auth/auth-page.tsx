import { redirect } from "next/navigation";
import { AuthShell } from "./auth-shell";
import { AuthForm, type AuthMode } from "./auth-form";
import { verifiedUser } from "@/features/auth/session";
import { authConfigured } from "@/lib/supabase/config";
import { safeNext } from "@/features/auth/validation";
export type AuthSearch = Promise<Record<string, string | string[] | undefined>>;
const copy = {
  login: ["Welcome back.", "A little less friction. A little more focus."],
  signup: [
    "Make room for progress.",
    "Create your account. Verify your email. Start with one small step.",
  ],
  forgot: [
    "Find your way back.",
    "We’ll send a secure link to help you reset your password.",
  ],
  reset: ["A fresh start.", "Choose a new password for your account."],
} as const;
export async function AuthPage({
  mode,
  searchParams,
}: {
  mode: Exclude<AuthMode, "profile">;
  searchParams: AuthSearch;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const user = await verifiedUser();
  if (user && ["login", "signup"].includes(mode)) redirect(next);
  const [title, description] = copy[mode];
  const expired = mode === "reset" && !user;
  return (
    <AuthShell title={title} description={description}>
      {params.message === "signed-out" && (
        <p role="status" className="auth-success">
          You’re signed out.
        </p>
      )}
      {params.message === "password-updated" && (
        <p role="status" className="auth-success">
          Password updated. Sign in with your new password.
        </p>
      )}
      {params.error === "callback" && (
        <p role="alert" className="auth-error">
          That confirmation link is invalid, expired, or was opened in a
          different browser. Try signing in or request a new password reset
          link.
        </p>
      )}
      {expired && (
        <p role="alert" className="auth-error">
          This reset session is missing or expired. Request a new reset link,
          then open it in this browser.
        </p>
      )}
      <AuthForm
        mode={mode}
        next={next}
        configured={authConfigured()}
        disabled={expired}
      />
    </AuthShell>
  );
}
