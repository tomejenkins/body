import { isUuid } from "@/features/exercises/validation";
export const activities = {
  treadmill: "Treadmill",
  outdoor_run: "Outdoor Run",
  elliptical: "Elliptical",
  bike: "Bike",
  stationary_bike: "Stationary Bike",
} as const;
export type CardioActivity = keyof typeof activities;
export type CardioItem = {
  id: string;
  revision: number;
  activity: CardioActivity;
  durationSeconds: number | null;
  completedAt: string | null;
};
export type CardioCommand = {
  session: string;
  item: string;
  operation: "add" | "save" | "remove";
  expected: number;
  activity: CardioActivity;
  seconds: number | null;
  request: string;
};
export function durationSeconds(minutes: string) {
  const clock = /^(\d{1,4}):([0-5]\d)$/.exec(minutes.trim());
  if (clock) {
    const seconds = Number(clock[1]) * 60 + Number(clock[2]);
    return seconds > 0 && seconds <= 86400 ? seconds : null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(minutes.trim())) return null;
  const raw = Number(minutes) * 60,
    seconds = Math.round(raw);
  return Number.isFinite(raw) &&
    Math.abs(raw - seconds) < 1e-8 &&
    seconds > 0 &&
    seconds <= 86400
    ? seconds
    : null;
}
export function validCardio(c: CardioCommand) {
  return (
    !!c &&
    [c.session, c.item, c.request].every(isUuid) &&
    Number.isSafeInteger(c.expected) &&
    c.expected >= 0 &&
    Object.hasOwn(activities, c.activity) &&
    ["add", "save", "remove"].includes(c.operation) &&
    (c.operation === "save"
      ? Number.isInteger(c.seconds) &&
        Number(c.seconds) > 0 &&
        Number(c.seconds) <= 86400
      : c.seconds === null)
  );
}
export function cardioMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60),
    remaining = seconds % 60;
  return remaining
    ? `${minutes ? `${minutes} min ` : ""}${remaining} sec`
    : `${minutes} min`;
}
export function cardioTotals(items: readonly CardioItem[] = []) {
  return {
    completed: items.filter((i) => i.durationSeconds !== null).length,
    pending: items.filter((i) => i.durationSeconds === null).length,
    seconds: items.reduce((n, i) => n + (i.durationSeconds ?? 0), 0),
  };
}
