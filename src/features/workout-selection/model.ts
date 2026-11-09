export type ProgramChoice = {
  id: string;
  position: number;
  number: number;
  name: string;
  recommended: boolean;
  completed: boolean;
  resolved: boolean;
  partialSession: string | null;
  resolution?: string | null;
};
export type AssignedChoices = {
  id: string;
  version: string;
  name: string;
  timezone: string;
  today: string;
  cursor: {
    workIndex: number;
    decisionRevision: number;
    rotation: number;
    dayId: string;
    position: number;
    complete: boolean;
    dueOn: string;
    readyOn: string;
    naturalReadyOn: string;
    deferredUntil: string | null;
  };
  days: ProgramChoice[];
};
export type FavoriteChoice = {
  id: string;
  name: string;
  sourceType: "program_day" | "completed_ad_hoc";
  movements: number;
  attribution: { program?: string; day?: string; workout?: string };
};
export type StartOptions = {
  activeSession: string | null;
  assignment: AssignedChoices | null;
  favorites: FavoriteChoice[];
};
export type SelectionState = { error?: string; success?: string };
export const decisionKinds = [
  "accept_partial",
  "skip",
  "defer",
  "cancel_defer",
] as const;
