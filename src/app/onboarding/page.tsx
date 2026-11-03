import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm, SignOutForm } from "@/components/auth/auth-form";
import type { AuthSearch } from "@/components/auth/auth-page";
import { requireUser } from "@/features/auth/session";
import { safeNext } from "@/features/auth/validation";
import { readAccount } from "@/features/auth/account";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };
export default async function Onboarding({
  searchParams,
}: {
  searchParams: AuthSearch;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const user = await requireUser(next);
  let account;
  let error: string | undefined;
  try {
    const client = await createClient({ readOnly: true });
    account = await readAccount(client, user.id);
  } catch {
    error =
      "Account setup could not be loaded. You’re still signed in. Try continuing again, or sign out and return later.";
  }
  if (account?.ready) redirect(next);
  return (
    <AuthShell
      title="Make yourself at home."
      description="One small detail, then your training space is ready."
    >
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <AuthForm
        mode="profile"
        next={next}
        displayName={account?.profile?.display_name ?? ""}
      />
      <SignOutForm />
    </AuthShell>
  );
}
