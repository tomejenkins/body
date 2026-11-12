"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsSheet } from "@/components/workouts/settings-sheet";
import { useWorkoutClosure } from "@/components/workouts/workout-closure";
import {
  activities,
  cardioMinutes,
  durationSeconds,
  type CardioActivity,
  type CardioItem,
  type CardioCommand,
} from "@/features/cardio/model";
import { recordCardio } from "@/features/cardio/actions";
export function CardioEntry({
  session,
  item,
  disabled = false,
  onBusy,
  onDirty,
}: {
  session: string;
  item?: CardioItem;
  disabled?: boolean;
  onBusy: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const router = useRouter(),
    closure = useWorkoutClosure();
  const [open, setOpen] = useState(false),
    [activity, setActivity] = useState<CardioActivity>(
      item?.activity ?? "treadmill",
    ),
    [minutes, setMinutes] = useState(
      item?.durationSeconds
        ? item.durationSeconds % 60
          ? `${Math.floor(item.durationSeconds / 60)}:${String(item.durationSeconds % 60).padStart(2, "0")}`
          : String(item.durationSeconds / 60)
        : "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [removeArmed, setRemoveArmed] = useState(false);
  const identity = useRef(item?.id ?? crypto.randomUUID()),
    request = useRef<CardioCommand | null>(null),
    writing = useRef(false);
  async function submit(operation: "add" | "save" | "remove") {
    if (writing.current || disabled || closure?.pending) return;
    const seconds = operation === "save" ? durationSeconds(minutes) : null;
    if (operation === "save" && seconds === null) {
      setError("Enter a duration between 1 second and 24 hours, in minutes.");
      return;
    }
    const payload = {
      session,
      item: identity.current,
      operation,
      expected: item?.revision ?? 0,
      activity,
      seconds,
    };
    if (
      !request.current ||
      JSON.stringify({ ...request.current, request: undefined }) !==
        JSON.stringify(payload)
    )
      request.current = { ...payload, request: crypto.randomUUID() };
    writing.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const result = await recordCardio(request.current).catch(() => ({
      error:
        "Save could not be confirmed. Retry the same values when connected.",
    }));
    writing.current = false;
    setBusy(false);
    onBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    request.current = null;
    onDirty?.(false);
    setOpen(false);
    router.refresh();
    if (!item) {
      identity.current = crypto.randomUUID();
      setMinutes("");
    }
  }
  return (
    <SettingsSheet
      label={item ? `Edit ${activities[item.activity]} cardio` : "Add Cardio"}
      title={item ? activities[item.activity] : "Add Cardio"}
      triggerText={
        item
          ? item.durationSeconds === null
            ? "Log duration"
            : "Edit duration"
          : "Add Cardio"
      }
      open={open}
      disabled={disabled || busy}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          if (!value) {
            setRemoveArmed(false);
            onDirty?.(false);
            setMinutes(
              item?.durationSeconds
                ? item.durationSeconds % 60
                  ? `${Math.floor(item.durationSeconds / 60)}:${String(item.durationSeconds % 60).padStart(2, "0")}`
                  : String(item.durationSeconds / 60)
                : "",
            );
          }
        }
      }}
      className="cardio-sheet"
    >
      {!item ? (
        <>
          <label>
            Activity
            <select
              aria-label="Cardio activity"
              value={activity}
              disabled={busy}
              onChange={(e) => setActivity(e.target.value as CardioActivity)}
            >
              {Object.entries(activities).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy} onClick={() => void submit("add")}>
            {busy ? "Adding…" : "Add Cardio"}
          </Button>
        </>
      ) : (
        <>
          <label>
            Duration (minutes or m:ss)
            <input
              aria-label={`${activities[item.activity]} duration in minutes`}
              inputMode="decimal"
              autoComplete="off"
              value={minutes}
              disabled={busy}
              onChange={(e) => {
                setMinutes(e.target.value);
                onDirty?.(true);
                setError("");
              }}
            />
          </label>
          <Button disabled={busy} onClick={() => void submit("save")}>
            {busy ? "Saving…" : "Save Cardio"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (item.durationSeconds !== null && !removeArmed)
                setRemoveArmed(true);
              else void submit("remove");
            }}
          >
            {removeArmed ? "Confirm Remove Cardio" : "Remove Cardio"}
          </Button>
          {item.durationSeconds !== null && (
            <p className="set-source">
              Saved · {cardioMinutes(item.durationSeconds)}
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </SettingsSheet>
  );
}
