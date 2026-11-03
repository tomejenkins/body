import { headers } from "next/headers";
import { safeNext } from "@/features/auth/validation";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/features/auth/session";
import { readAccount } from "@/features/auth/account";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const next = safeNext((await headers()).get("x-body-next"));
  const user = await requireUser(next);
  let ready = false;
  try {
    const client = await createClient({ readOnly: true });
    ready = (await readAccount(client, user.id)).ready;
  } catch {
    ready = false;
  }
  if (!ready) redirect("/onboarding?next=" + encodeURIComponent(next));
  return <AppShell>{children}</AppShell>;
}
