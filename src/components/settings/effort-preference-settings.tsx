"use client";
import { useState } from "react";
import { saveEffortPreference } from "@/features/sets/actions";
import type { EffortScale } from "@/features/sets/effort";
export function EffortPreferenceSettings({
  initialScale,
}: {
  initialScale: EffortScale;
}) {
  const [scale, setScale] = useState(initialScale),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="library-section" aria-label="Effort input preference">
      <label htmlFor="effort-preference">Preferred effort scale</label>
      <select
        id="effort-preference"
        value={scale}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.value as EffortScale;
          setBusy(true);
          setMessage("Saving…");
          try {
            const result = await saveEffortPreference(next);
            if (result.error) setMessage(result.error);
            else {
              setScale(next);
              setMessage("Saved. New workout views will use this scale.");
            }
          } catch {
            setMessage("Preference could not be saved. Retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="rpe">RPE · perceived exertion</option>
        <option value="rir">RIR · reps in reserve</option>
      </select>
      <p>
        Effort ratings stay optional. Existing ratings keep their entered scale
        and value.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
