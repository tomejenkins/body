"use client";
import { useState } from "react";
import { saveWeightUnit } from "@/features/sets/actions";
import type { WeightUnit } from "@/features/sets/model";
export function WeightUnitSettings({
  initialUnit,
}: {
  initialUnit: WeightUnit;
}) {
  const [unit, setUnit] = useState(initialUnit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section
      className="library-section weight-unit-settings"
      aria-labelledby="settings-title"
    >
      <h2 id="settings-title">Settings</h2>
      <label htmlFor="weight-units">Weight Units</label>{" "}
      <select
        id="weight-units"
        value={unit}
        disabled={busy}
        onChange={async (event) => {
          const next = event.target.value as WeightUnit;
          setBusy(true);
          setMessage("Saving…");
          try {
            const result = await saveWeightUnit(next);
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setUnit(next);
            setMessage("Saved. New workout views will use your preference.");
          } catch {
            setMessage(
              "Preference could not be saved. Check your connection and retry.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="lb">Pounds (lb)</option>
        <option value="kg">Kilograms (kg)</option>
      </select>
      <p role="status">{message}</p>
    </section>
  );
}
