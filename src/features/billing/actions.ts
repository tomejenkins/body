"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { billingService } from "./service";
import { parsePlan } from "./config";
export type BillingActionState = { error?: string; message?: string };
export async function startCheckout(
  _state: BillingActionState,
  form: FormData,
): Promise<BillingActionState> {
  const user = await requireUser("/access");
  let url: string;
  try {
    const plan = parsePlan(form.get("plan"));
    url = await billingService().checkout(user.id, plan);
    if (new URL(url).origin !== "https://checkout.stripe.com")
      throw new Error("Invalid checkout destination.");
  } catch {
    return {
      error:
        "Checkout could not be opened. A previous purchase may still be pending. Refresh billing status or manage your existing subscription before trying again.",
    };
  }
  redirect(url);
}
export async function openPortal(): Promise<BillingActionState> {
  const user = await requireUser("/access");
  let url: string;
  try {
    url = await billingService().portal(user.id);
    if (new URL(url).origin !== "https://billing.stripe.com")
      throw new Error("Invalid billing destination.");
  } catch {
    return {
      error:
        "Billing settings could not be opened. Please try again when connected.",
    };
  }
  redirect(url);
}
export async function refreshBilling(
  _state: BillingActionState,
  form: FormData,
): Promise<BillingActionState> {
  const user = await requireUser("/access/return");
  const session = form.get("session");
  if (
    session &&
    (typeof session !== "string" || !/^cs_[A-Za-z0-9_]{1,250}$/.test(session))
  )
    return { error: "Invalid checkout reference." };
  try {
    await billingService().reconcile(
      user.id,
      typeof session === "string" && session ? session : undefined,
    );
  } catch {
    return {
      error:
        "Confirmation is temporarily unavailable. Your history is safe. Please wait a moment and try again.",
    };
  }
  revalidatePath("/", "layout");
  return {
    message:
      "Billing status refreshed. Access appears below once payment is confirmed.",
  };
}
