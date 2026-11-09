// Schedule decisions are validated by decide_program_schedule against the
// owned immutable version, exact occurrence, cursor/revision and profile lock.
type PositionIdentity = {
  assignmentId: string;
  versionId: string;
  rotation: number;
  programDayId: string;
  expectedWorkIndex: number;
  expectedRevision: number;
  requestId: string;
};
export type FutureScheduleDecision = PositionIdentity &
  (
    | { kind: "accept_partial"; sessionId: string }
    | { kind: "skip"; reason?: string }
    | { kind: "defer"; localDate: string }
    | { kind: "cancel_defer" }
    | { kind: "link_independent_workout"; sessionId: string }
  );
// Favorites stay independent by default: no assignment/day/rotation identity.
export type IndependentWorkoutSource = { kind: "favorite"; favoriteId: string };
