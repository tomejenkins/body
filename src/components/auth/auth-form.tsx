"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  login,
  signup,
  requestPasswordReset,
  resetPassword,
  completeProfile,
  signOut,
} from "@/features/auth/actions";
import { initialAuthState } from "@/features/auth/validation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export type AuthMode = "login" | "signup" | "forgot" | "reset" | "profile";
const actions = {
  login,
  signup,
  forgot: requestPasswordReset,
  reset: resetPassword,
  profile: completeProfile,
};
const labels = {
  login: "Sign in",
  signup: "Create account",
  forgot: "Send reset link",
  reset: "Update password",
  profile: "Continue to your training space",
};
export function AuthForm({
  mode,
  next = "/dashboard",
  configured = true,
  disabled = false,
  displayName = "",
}: {
  mode: AuthMode;
  next?: string;
  configured?: boolean;
  disabled?: boolean;
  displayName?: string;
}) {
  const [state, action, pending] = useActionState(
    actions[mode],
    initialAuthState,
  );
  const [emailValue, setEmailValue] = useState("");
  const [profileName, setProfileName] = useState(displayName);
  const email = ["login", "signup", "forgot"].includes(mode);
  const password = ["login", "signup", "reset"].includes(mode);
  const success = !!state.success;
  return (
    <>
      <form
        action={action}
        className="auth-form"
        aria-describedby="auth-status"
      >
        <input type="hidden" name="next" value={next} />
        {email && (
          <div className="auth-field">
            <label htmlFor="email">Email address</label>
            <Input
              id="email"
              name="email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
              disabled={pending || !configured || disabled}
            />
          </div>
        )}
        {password && (
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "login" ? 1 : 12}
              maxLength={72}
              required
              disabled={pending || !configured || disabled}
            />
            {mode !== "login" && (
              <p className="auth-hint">
                Use at least 12 characters. A longer passphrase works well.
              </p>
            )}
          </div>
        )}
        {["signup", "reset"].includes(mode) && (
          <div className="auth-field">
            <label htmlFor="confirmation">Confirm password</label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
              disabled={pending || !configured || disabled}
            />
          </div>
        )}
        {mode === "profile" && (
          <div className="auth-field">
            <label htmlFor="displayName">What should we call you?</label>
            <Input
              id="displayName"
              name="displayName"
              autoComplete="nickname"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              maxLength={120}
              required
              disabled={pending || !configured || disabled}
            />
            <p className="auth-hint">
              Just a display name for now. Training preferences can come later.
            </p>
          </div>
        )}
        <div id="auth-status" aria-live="polite">
          {!configured && (
            <p role="alert" className="auth-error">
              Authentication is not configured in this environment. Please
              follow the setup instructions before signing in.
            </p>
          )}
          {state.error && (
            <p role="alert" className="auth-error">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="auth-success">
              {state.success}
            </p>
          )}
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={pending || !configured || disabled || success}
          aria-busy={pending}
        >
          {pending ? "Please wait…" : labels[mode]}
        </Button>
      </form>
      <div className="auth-links">
        {mode === "login" && (
          <>
            <Link href="/forgot-password">Forgot your password?</Link>
            <p>
              New here?{" "}
              <Link href={"/signup?next=" + encodeURIComponent(next)}>
                Create an account
              </Link>
            </p>
          </>
        )}
        {mode === "signup" && (
          <p>
            Already have an account?{" "}
            <Link href={"/login?next=" + encodeURIComponent(next)}>
              Sign in
            </Link>
          </p>
        )}
        {mode === "forgot" && <Link href="/login">Back to sign in</Link>}
        {mode === "reset" && (
          <Link href="/forgot-password">Request a new reset link</Link>
        )}
      </div>
    </>
  );
}
export function SignOutForm() {
  const [state, action, pending] = useActionState(signOut, initialAuthState);
  return (
    <form action={action} className="signout-form">
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
