import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { readAccount } from "@/features/auth/account";
import { createClient } from "@/lib/supabase/server";
import { SignOutForm } from "@/components/auth/auth-form";
export const metadata = { title: "Profile" };
export default async function Page() {
  const user = await requireUser("/profile");
  const client = await createClient({ readOnly: true });
  const account = await readAccount(client, user.id);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MAKE IT YOURS</p>
        <h1>Your space. Your pace.</h1>
        <p className="intro">
          A little space for the person behind the progress.
        </p>
      </div>
      <section className="empty-state">
        <h2>{account.profile?.display_name}</h2>
        <p>
          Your account is private. More training preferences are coming later.
        </p>
        <div className="auth-links">
          <Link href="/forgot-password">Reset your password</Link>
        </div>
        <SignOutForm />
      </section>
    </>
  );
}
