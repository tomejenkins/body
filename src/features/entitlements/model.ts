export type AccessSource =
  "trial" | "subscription" | "promotion" | "lifetime" | "none";
export type AccessDecision = {
  allowed: boolean;
  source: AccessSource;
  expiresAt: string | null;
  trialActivatedAt: string | null;
  trialExpiresAt: string | null;
  state: "trial" | "active" | "expired" | "uninitialized";
  continuationAllowed: boolean;
  continuationUntil: string | null;
  checkedAt: string;
};
export type AccessResult =
  | { status: "ready"; decision: AccessDecision }
  | { status: "unauthenticated" }
  | { status: "unavailable" };
export function trainingAllowed(result: AccessResult): boolean {
  return (
    result.status === "ready" &&
    (result.decision.allowed || result.decision.continuationAllowed)
  );
}
const timestamp = (value: unknown) =>
  value === null ||
  (typeof value === "string" && Number.isFinite(Date.parse(value)));
export function parseAccess(value: unknown): AccessDecision | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.allowed !== "boolean" ||
    typeof v.continuationAllowed !== "boolean" ||
    !["trial", "subscription", "promotion", "lifetime", "none"].includes(
      String(v.source),
    ) ||
    !["trial", "active", "expired", "uninitialized"].includes(
      String(v.state),
    ) ||
    ![
      v.expiresAt,
      v.trialActivatedAt,
      v.trialExpiresAt,
      v.continuationUntil,
    ].every(timestamp) ||
    typeof v.checkedAt !== "string" ||
    !timestamp(v.checkedAt)
  )
    return null;
  return v as AccessDecision;
}
