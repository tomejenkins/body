"use server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/exercises/validation";
import { revalidatePath } from "next/cache";
import { validMembers, type GroupCommand, type ExerciseGroup } from "./model";
export type GroupResult = {
  groups?: ExerciseGroup[];
  error?: string;
  conflict?: boolean;
};
export async function changeGroup(command: GroupCommand): Promise<GroupResult> {
  if (
    !command ||
    ![command.session, command.group, command.request].every(isUuid) ||
    !Number.isSafeInteger(command.expected) ||
    command.expected < 0 ||
    !["create", "edit", "ungroup"].includes(command.operation) ||
    (command.operation === "ungroup"
      ? !Array.isArray(command.members) || command.members.length !== 0
      : !validMembers(command.members))
  )
    return { error: "Choose two or three distinct movements." };
  try {
    const client = await createClient(),
      identity = await client.auth.getUser();
    if (identity.error || !identity.data.user)
      return { error: "Sign in again before changing this workout." };
    const result = await client.rpc("change_workout_group", {
      p_session: command.session,
      p_group: command.group,
      p_operation: command.operation,
      p_expected: command.expected,
      p_members: command.members,
      p_request: command.request,
    });
    if (result.error)
      return {
        error:
          result.error.code === "40001"
            ? "Superset changed on another device. Refresh before editing."
            : "Superset not changed. Check available movements and refresh if this workout closed.",
        conflict: result.error.code === "40001",
      };
    if (!Array.isArray(result.data?.groups))
      return {
        error: "The change could not be confirmed. Retry the same request.",
      };
    revalidatePath(`/workout/${command.session}`);
    revalidatePath(`/history/${command.session}`);
    return { groups: result.data.groups as ExerciseGroup[] };
  } catch {
    return {
      error:
        "The change could not be confirmed. Retry the same selection when connected.",
    };
  }
}
