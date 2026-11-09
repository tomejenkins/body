import { randomUUID } from "node:crypto";
import { SelectionForm } from "./selection-form";
export function SaveFavorite({
  type,
  source,
  day,
  name,
}: {
  type: "program_day" | "completed_ad_hoc";
  source: string;
  day?: string;
  name: string;
}) {
  return (
    <details className="save-favorite">
      <summary>Save as Favorite</summary>
      <p className="set-source">
        Save the movement structure. New sessions are independent and contain no
        completed performance.
      </p>
      <SelectionForm
        kind="save"
        fields={{
          sourceType: type,
          source,
          request: randomUUID(),
          ...(day ? { day } : {}),
        }}
        label="Save Favorite"
      >
        <label>
          Favorite name
          <input
            name="name"
            defaultValue={name.slice(0, 100)}
            maxLength={100}
            required
          />
        </label>
      </SelectionForm>
    </details>
  );
}
