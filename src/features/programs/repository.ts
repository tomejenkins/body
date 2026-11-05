import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
async function ownRpc(
  name: "snapshot_program" | "clone_program",
  args: Record<string, string>,
) {
  const client = await createClient();
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data.user)
    throw new Error("Sign in required.");
  const result = await client.rpc(name, args);
  if (result.error || typeof result.data !== "string" || !isUuid(result.data))
    throw new Error("Program operation could not be completed.");
  return result.data;
}
export async function snapshotOwnProgram(programId: string) {
  if (!isUuid(programId)) throw new Error("Invalid program.");
  return ownRpc("snapshot_program", { p_program: programId });
}
export async function cloneOwnVersion(
  versionId: string,
  name: string,
  requestId: string,
) {
  if (
    !isUuid(versionId) ||
    !isUuid(requestId) ||
    name.trim().length < 1 ||
    name.trim().length > 200
  )
    throw new Error("Invalid copy request.");
  return ownRpc("clone_program", {
    p_version: versionId,
    p_name: name.trim(),
    p_request: requestId,
  });
}
