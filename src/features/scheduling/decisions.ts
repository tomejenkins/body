// Phase 7.5B input contracts only. No client decision is accepted or persisted yet.
// A future invoker operation must verify this identity against the assignment,
// its immutable version and current cursor while holding the owner profile lock.
type PositionIdentity = {
  assignmentId: string;
  versionId: string;
  rotation: number;
  programDayId: string;
  expectedWorkIndex: number;
  requestId: string;
};
export type FutureScheduleDecision = PositionIdentity &
  (
    | { kind: "accept_partial"; sessionId: string }
    | { kind: "skip"; reason?: string }
    | { kind: "defer"; localDate: string }
    | { kind: "link_independent_workout"; sessionId: string }
  );
// Favorites stay independent by default: no assignment/day/rotation identity.
export type IndependentWorkoutSource = { kind: "favorite"; favoriteId: string };
