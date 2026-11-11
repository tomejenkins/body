import { randomUUID } from "node:crypto";
import { loadSavedFavoriteKeys } from "@/features/workout-selection/queries";
import { SaveFavoriteButton } from "./save-favorite-button";
export async function SaveFavorite({
  type,
  source,
  day,
}: {
  type: "program_day" | "completed_ad_hoc";
  source: string;
  day?: string;
}) {
  const keys = await loadSavedFavoriteKeys();
  const saved = keys.has(`${type}:${source}${day ? `:${day}` : ""}`);
  return (
    <SaveFavoriteButton
      key={`${type}:${source}:${day ?? ""}:${saved}`}
      type={type}
      source={source}
      day={day}
      request={randomUUID()}
      saved={saved}
    />
  );
}
