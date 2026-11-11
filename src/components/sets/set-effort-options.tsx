"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { rpeValues, rirValues, type EffortScale } from "@/features/sets/effort";
import type { SetDraft } from "@/features/sets/model";
import { SetOptionHelp } from "./set-option-help";

type EffortDraft = Pick<
  SetDraft,
  "effortScale" | "effortValue" | "toFailure" | "type"
>;
export function SetEffortOptions({
  draft,
  preferredScale,
  name,
  disabled,
  onChange,
}: {
  draft: EffortDraft;
  preferredScale: EffortScale;
  name: string;
  disabled: boolean;
  onChange: (patch: Partial<EffortDraft>) => void;
}) {
  // These flags open editors only; actual values always come from the logger draft.
  const [recording, setRecording] = useState(false);
  const [more, setMore] = useState(false);
  const id = useId();
  const scale = draft.effortScale ?? preferredScale;
  const ratingVisible = recording || !!draft.effortValue?.trim();
  return (
    <div className="set-effort-options">
      <div className="set-option-label">
        <span>Effort · Optional</span>
        <SetOptionHelp title={scale.toUpperCase()}>
          {scale === "rir"
            ? "Reps in Reserve estimates repetitions left with good technique. RIR 0 means none remain; 5+ means at least five."
            : "Rate how difficult the set felt. Body records RPE 6–10; higher ratings mean greater effort."}
        </SetOptionHelp>
      </div>
      {ratingVisible ? (
        <label>
          <span className="sr-only">{scale.toUpperCase()} rating</span>
          <select
            aria-label={`${name} effort rating`}
            value={draft.effortValue ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({ effortScale: scale, effortValue: event.target.value })
            }
          >
            <option value="">{scale.toUpperCase()} · Not recorded</option>
            {(scale === "rpe" ? rpeValues : rirValues).map((value) => (
              <option key={value} value={value}>
                {scale.toUpperCase()}{" "}
                {scale === "rir" && value === 5 ? "5+" : value}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setRecording(true)}
        >
          Record effort
        </Button>
      )}
      <button
        type="button"
        className="set-effort-more"
        aria-expanded={more}
        aria-controls={id}
        onClick={() => setMore(!more)}
      >
        More effort options{draft.toFailure ? " · Failure recorded" : ""}
      </button>
      {more && (
        <div id={id} className="set-effort-secondary">
          <label>
            Scale
            <select
              aria-label={`${name} effort scale`}
              value={scale}
              disabled={disabled}
              onChange={(event) => {
                setRecording(true);
                onChange({
                  effortScale: event.target.value as EffortScale,
                  effortValue: "",
                });
              }}
            >
              <option value="rpe">RPE</option>
              <option value="rir">RIR</option>
            </select>
          </label>
          <div className="set-option-label">
            <label className="check-label">
              <input
                type="checkbox"
                aria-label={`${name} To Failure`}
                checked={draft.toFailure ?? false}
                disabled={disabled || draft.type === "warm_up"}
                onChange={(event) =>
                  onChange({ toFailure: event.target.checked })
                }
              />
              To Failure
            </label>
            <SetOptionHelp title="explicit failure">
              An explicit report that another repetition could not be completed
              with good technique, separate from RIR 0 or RPE 10. Clear it
              before choosing Warm-up.
            </SetOptionHelp>
          </div>
        </div>
      )}
    </div>
  );
}
