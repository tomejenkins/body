import { EffortPreferenceSettings } from "@/components/settings/effort-preference-settings";
import { WeightUnitSettings } from "@/components/settings/weight-unit-settings";
import type { WeightUnit } from "@/features/sets/model";
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
  const preference = await client
    .from("account_preferences")
    .select("display_weight_unit,preferred_effort_scale")
    .eq("owner_id", user.id)
    .single<{
      display_weight_unit: WeightUnit;
      preferred_effort_scale: import("@/features/sets/effort").EffortScale;
    }>();
  if (preference.error)
    throw new Error("Weight preference could not be loaded.");
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MAKE IT YOURS</p>
        <h1>Profile</h1>
        <p className="intro">Account and workout preferences.</p>
      </div>
      <WeightUnitSettings initialUnit={preference.data.display_weight_unit} />
      <EffortPreferenceSettings
        initialScale={preference.data.preferred_effort_scale}
      />
      <section className="account-group">
        <h2>{account.profile?.display_name}</h2>
        <p>Your account and training history are private.</p>
        <div className="auth-links">
          <Link href="/forgot-password">Reset your password</Link>
        </div>
        <SignOutForm />
      </section>
    </>
  );
}
