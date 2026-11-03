import { exerciseTypes, type ExerciseType } from "./types";
export const isUuid = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function parseExercise(data: FormData) {
  const value = (key: string) => {
    const v = data.get(key);
    return typeof v === "string" ? v.trim() : "";
  };
  const ids = (key: string) => [
    ...new Set(
      data.getAll(key).filter((v): v is string => typeof v === "string"),
    ),
  ];
  const input = {
    id: value("id") || null,
    name: value("name"),
    exerciseType: value("exerciseType") as ExerciseType,
    primaryPatternId: value("primaryPatternId"),
    secondaryPatternIds: ids("secondaryPatternIds"),
    primaryMuscleIds: ids("primaryMuscleIds"),
    secondaryMuscleIds: ids("secondaryMuscleIds"),
    equipmentIds: ids("equipmentIds"),
    instructions: value("instructions"),
  };
  if (input.id && !isUuid(input.id))
    throw new Error("Invalid exercise identifier.");
  if (!input.name || input.name.length > 200)
    throw new Error("Enter an exercise name of 1–200 characters.");
  if (!exerciseTypes.includes(input.exerciseType))
    throw new Error("Choose compound, isolation or other.");
  if (
    !isUuid(input.primaryPatternId) ||
    !input.primaryMuscleIds.length ||
    !input.equipmentIds.length
  )
    throw new Error(
      "Choose a primary movement, primary muscles and required equipment (or None).",
    );
  for (const list of [
    input.secondaryPatternIds,
    input.primaryMuscleIds,
    input.secondaryMuscleIds,
    input.equipmentIds,
  ]) {
    if (list.length > 10 || list.some((v) => !isUuid(v)))
      throw new Error("Invalid classification selection.");
  }
  if (
    input.secondaryPatternIds.length > 5 ||
    input.secondaryPatternIds.includes(input.primaryPatternId) ||
    input.primaryMuscleIds.some((id) => input.secondaryMuscleIds.includes(id))
  )
    throw new Error("Keep primary and secondary classifications distinct.");
  if (input.instructions.length > 3000)
    throw new Error("Keep instructions under 3,000 characters.");
  return input;
}
