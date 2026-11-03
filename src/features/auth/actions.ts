"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authConfigured, getSiteOrigin } from "@/lib/supabase/config";
import { AccountSetupError, initializeAccount } from "./account";
import {
  field,
  safeNext,
  validateEmail,
  validateRegistration,
  type AuthState,
} from "./validation";

export async function login(
  _previous: AuthState,
  data: FormData,
): Promise<AuthState> {
  if (!authConfigured())
    return {
      error:
        "Authentication is unavailable. Please check the environment configuration.",
    };
  const email = field(data, "email").trim();
  const password = field(data, "password");
  if (!validateEmail(email) || !password)
    return { error: "Enter your email and password." };
  try {
    const client = await createClient();
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error)
      return {
        error:
          result.error.code === "email_not_confirmed"
            ? "Verify your email before signing in. Check your inbox for the confirmation link."
            : "Sign-in failed. Check your email and password, then try again.",
      };
  } catch {
    return { error: "We couldn’t connect. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect(safeNext(field(data, "next")));
}
export async function signup(
  _previous: AuthState,
  data: FormData,
): Promise<AuthState> {
  if (!authConfigured())
    return {
      error:
        "Authentication is unavailable. Please check the environment configuration.",
    };
  const email = field(data, "email").trim();
  const password = field(data, "password");
  const error = validateRegistration(
    email,
    password,
    field(data, "confirmation"),
  );
  if (error) return { error };
  let signedIn = false;
  try {
    const client = await createClient();
    const result = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          getSiteOrigin() +
          "/auth/callback?next=" +
          encodeURIComponent(safeNext(field(data, "next"))),
      },
    });
    if (result.error)
      return {
        error:
          "Account creation could not be completed. Please try again later, or sign in if you already have an account.",
      };
    signedIn = !!result.data.session;
  } catch {
    return { error: "We couldn’t connect. Please try again." };
  }
  if (signedIn) {
    revalidatePath("/", "layout");
    redirect(safeNext(field(data, "next")));
  }
  return {
    success:
      "Check your email to verify your account. Open the confirmation link in this browser, then choose your display name. If you already have an account, sign in or reset your password.",
  };
}
export async function requestPasswordReset(
  _previous: AuthState,
  data: FormData,
): Promise<AuthState> {
  if (!authConfigured())
    return {
      error:
        "Authentication is unavailable. Please check the environment configuration.",
    };
  const email = field(data, "email").trim();
  if (!validateEmail(email)) return { error: "Enter a valid email address." };
  try {
    const client = await createClient();
    const result = await client.auth.resetPasswordForEmail(email, {
      redirectTo: getSiteOrigin() + "/auth/callback?next=/reset-password",
    });
    if (result.error)
      return {
        error:
          "The request could not be completed. Please wait a moment and try again.",
      };
  } catch {
    return { error: "We couldn’t connect. Please try again." };
  }
  return {
    success:
      "If an account exists for that email, you’ll receive a password reset link. Open it in this browser.",
  };
}
export async function resetPassword(
  _previous: AuthState,
  data: FormData,
): Promise<AuthState> {
  const password = field(data, "password");
  const error = validateRegistration(
    "valid@example.invalid",
    password,
    field(data, "confirmation"),
  );
  if (error) return { error };
  if (!authConfigured()) return { error: "Authentication is unavailable." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "This session has expired. Request a new reset link." };
    const result = await client.auth.updateUser({ password });
    if (result.error)
      return {
        error:
          "The password could not be changed. Request a new link or try a different password.",
      };
    const signedOut = await client.auth.signOut({ scope: "local" });
    if (signedOut.error)
      return {
        error:
          "Your password changed, but sign-out could not finish. Please try signing out again.",
      };
  } catch {
    return { error: "We couldn’t connect. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login?message=password-updated");
}
export async function completeProfile(
  _previous: AuthState,
  data: FormData,
): Promise<AuthState> {
  if (!authConfigured()) return { error: "Authentication is unavailable." };
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Your session expired. Sign in again to finish setup." };
    await initializeAccount(
      client,
      identity.data.user.id,
      field(data, "displayName"),
    );
  } catch (error) {
    return {
      error:
        error instanceof AccountSetupError
          ? error.message
          : "Account setup could not finish. Please retry.",
    };
  }
  revalidatePath("/", "layout");
  redirect(safeNext(field(data, "next")));
}
export async function signOut(): Promise<AuthState> {
  if (!authConfigured()) redirect("/login");
  try {
    const client = await createClient();
    const result = await client.auth.signOut({ scope: "local" });
    if (result.error)
      return { error: "Sign-out could not finish. Please retry." };
  } catch {
    return { error: "We couldn’t connect. Please retry sign-out." };
  }
  revalidatePath("/", "layout");
  redirect("/login?message=signed-out");
}
