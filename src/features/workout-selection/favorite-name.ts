import { friendlyWorkoutName } from "@/features/history/model";
// Keep the existing web name limit without splitting a Unicode character.
export function favoriteDefaultName(name: string) {
  const source = friendlyWorkoutName(name.trim()) || "Workout";
  let bounded = "";
  for (const character of source) {
    if (bounded.length + character.length > 100) break;
    bounded += character;
  }
  return bounded;
}
