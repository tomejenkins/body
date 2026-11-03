import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  login,
  signup,
  requestPasswordReset,
  resetPassword,
  signOut,
  completeProfile,
} from "./actions";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("REDIRECT:" + path);
  },
}));
const methods = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
};
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-public-test-value");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
  vi.mocked(createClient).mockResolvedValue({
    auth: methods,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});
afterEach(() => vi.unstubAllEnvs());
describe("server authentication actions", () => {
  it("rejects failed login without revealing provider details", async () => {
    methods.signInWithPassword.mockResolvedValue({
      error: { message: "private details" },
    });
    expect(
      (await login({}, form({ email: "user@example.test", password: "wrong" })))
        .error,
    ).toMatch(/Sign-in failed/);
  });
  it("handles verification-required login", async () => {
    methods.signInWithPassword.mockResolvedValue({
      error: { code: "email_not_confirmed" },
    });
    expect(
      (
        await login(
          {},
          form({ email: "user@example.test", password: "valid passphrase" }),
        )
      ).error,
    ).toMatch(/Verify your email/);
  });
  it("logs in and rejects open-redirect destinations", async () => {
    methods.signInWithPassword.mockResolvedValue({ error: null });
    await expect(
      login(
        {},
        form({
          email: "user@example.test",
          password: "valid passphrase",
          next: "//evil.example",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("does not send invalid registration data", async () => {
    expect(
      (
        await signup(
          {},
          form({
            email: "user@example.test",
            password: "short",
            confirmation: "short",
          }),
        )
      ).error,
    ).toBeTruthy();
    expect(methods.signUp).not.toHaveBeenCalled();
  });
  it("requires email verification when signup has no session", async () => {
    methods.signUp.mockResolvedValue({ error: null, data: { session: null } });
    const result = await signup(
      {},
      form({
        email: "user@example.test",
        password: "valid passphrase",
        confirmation: "valid passphrase",
      }),
    );
    expect(result.success).toMatch(/verify your account/);
    expect(methods.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo:
            "http://127.0.0.1:3000/auth/callback?next=%2Fdashboard",
        },
      }),
    );
  });
  it("returns a safe retry message on registration failure", async () => {
    methods.signUp.mockRejectedValue(new Error("sensitive data"));
    const r = await signup(
      {},
      form({
        email: "user@example.test",
        password: "valid passphrase",
        confirmation: "valid passphrase",
      }),
    );
    expect(r.error).toBe("We couldn’t connect. Please try again.");
  });
  it("sends recovery to the trusted callback and returns an enumeration-safe response", async () => {
    methods.resetPasswordForEmail.mockResolvedValue({ error: null });
    expect(
      (await requestPasswordReset({}, form({ email: "user@example.test" })))
        .success,
    ).toMatch(/If an account exists/);
    expect(methods.resetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.test",
      {
        redirectTo: "http://127.0.0.1:3000/auth/callback?next=/reset-password",
      },
    );
  });
  it("does not reset a password or initialize a profile with an expired identity", async () => {
    methods.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "expired" },
    });
    expect(
      (
        await resetPassword(
          {},
          form({
            password: "valid passphrase",
            confirmation: "valid passphrase",
          }),
        )
      ).error,
    ).toMatch(/expired/);
    expect(
      (await completeProfile({}, form({ displayName: "Name" }))).error,
    ).toMatch(/expired/);
    expect(methods.updateUser).not.toHaveBeenCalled();
  });
  it("updates password only after verification, then signs out", async () => {
    methods.getUser.mockResolvedValue({
      data: { user: { id: "verified" } },
      error: null,
    });
    methods.updateUser.mockResolvedValue({ error: null });
    methods.signOut.mockResolvedValue({ error: null });
    await expect(
      resetPassword(
        {},
        form({
          password: "valid passphrase",
          confirmation: "valid passphrase",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login?message=password-updated");
    expect(methods.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("signs out through a server action and reports retryable failures", async () => {
    methods.signOut
      .mockResolvedValueOnce({ error: { message: "failed" } })
      .mockResolvedValueOnce({ error: null });
    expect((await signOut()).error).toMatch(/retry/);
    await expect(signOut()).rejects.toThrow(
      "REDIRECT:/login?message=signed-out",
    );
  });
});
