"use client";
import { cn } from "@/lib/utils";
import { InlineAbandon, useWorkoutClosure } from "./workout-closure";
import { Dialog } from "radix-ui";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Continuity } from "@/features/continuity/model";
import {
  readWorkoutContinuity,
  setWorkoutPause,
} from "@/features/continuity/actions";
import {
  timerLabel,
  timerRunning,
  newerTimerState,
} from "@/features/continuity/timer";
import { Button } from "@/components/ui/button";
async function readTimer(session: string) {
  try {
    return await readWorkoutContinuity(session);
  } catch {
    return {
      data: null,
      error: "Timing could not be refreshed. Check your connection.",
    };
  }
}
export function WorkoutModeControls({
  session,
  value,
  onState,
  backHref,
  home,
  disabled,
  children,
  exerciseActions,
}: {
  session: string;
  value: Continuity | null;
  onState: (value: Continuity) => void;
  backHref: string;
  home: boolean;
  disabled: boolean;
  children: React.ReactNode;
  exerciseActions?: React.ReactNode;
}) {
  const closure = useWorkoutClosure();
  const footer = useRef<HTMLElement>(null);
  const [seconds, setSeconds] = useState(
    value?.effective_elapsed_seconds ?? null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [readError, setReadError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const current = useRef(value);
  useLayoutEffect(() => {
    current.current = value;
  }, [value]);
  const seq = useRef(0),
    request = useRef<{ id: string; paused: boolean; revision: number } | null>(
      null,
    );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const accept = (next: Continuity) => {
      if (newerTimerState(next, current.current)) {
        current.current = next;
        onState(next);
      }
    };
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const ticket = ++seq.current;
      const result = await readTimer(session);
      if (!alive.current || ticket !== seq.current) return;
      setReadError(result.error ?? "");
      if (result.data) accept(result.data);
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`body-workout-timer:${session}`)
        : null;
    if (channel) channel.onmessage = () => void refresh(); // Messages request a verified read, never carry trusted state.
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false;
      clearInterval(interval);
      channel?.close();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, onState]);
  const base = value?.effective_elapsed_seconds ?? null;
  const running = !!value && timerRunning(value);
  useEffect(() => {
    const anchor = performance.now();
    const tick = () =>
      setSeconds(
        base == null
          ? null
          : base + (running ? (performance.now() - anchor) / 1000 : 0),
      );
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [base, running, value?.server_now]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const inset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setKeyboard(inset > 150 ? inset : 0);
      if (
        inset > 150 &&
        document.activeElement?.matches(
          ".workout-execution input, .workout-execution select",
        )
      )
        document.activeElement.scrollIntoView({
          block: "center",
          behavior: "auto",
        });
    };
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useLayoutEffect(() => {
    const element = footer.current,
      root = element?.closest<HTMLElement>(".workout-execution");
    if (!element || !root) return;
    const publish = () =>
      root.style.setProperty(
        "--workout-controls-space",
        `${Math.ceil(element.getBoundingClientRect().height) + keyboard}px`,
      );
    publish();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(publish)
        : null;
    observer?.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--workout-controls-space");
    };
  }, [keyboard]);
  async function changePause() {
    const snapshot = current.current;
    if (!snapshot || busy || snapshot.timer_revision === undefined) return;
    request.current ??= {
      id: crypto.randomUUID(),
      paused: !snapshot.manual_paused_at,
      revision: snapshot.timer_revision,
    };
    setRetrying(true);
    const command = request.current;
    seq.current++;
    setBusy(true);
    setError("");
    let result: Awaited<ReturnType<typeof setWorkoutPause>>;
    try {
      result = await setWorkoutPause(
        session,
        command.paused,
        command.revision,
        command.id,
      );
    } catch {
      result = {
        data: null,
        error: "Timer change could not be confirmed. Retry when connected.",
      };
    }
    if (!alive.current) return;
    setBusy(false);
    if (result.data && newerTimerState(result.data, current.current)) {
      current.current = result.data;
      onState(result.data);
    }
    if (result.error) {
      setError(result.error);
      if (result.conflict) {
        request.current = null;
        setRetrying(false);
        const fresh = await readTimer(session);
        if (
          alive.current &&
          fresh.data &&
          newerTimerState(fresh.data, current.current)
        ) {
          current.current = fresh.data;
          onState(fresh.data);
        }
      }
      return;
    }
    request.current = null;
    setRetrying(false);
    setReadError("");
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`body-workout-timer:${session}`)
        : null;
    channel?.postMessage("refresh");
    channel?.close();
  }
  const closed = value?.status !== "in_progress",
    paused = !!value?.manual_paused_at;
  const state = !value
    ? "Unavailable"
    : closed
      ? "Closed"
      : paused
        ? "Paused"
        : "Running";
  return (
    <nav
      className={cn("workout-mode-controls", closure && "has-inline-abandon")}
      ref={footer}
      aria-label="Workout controls"
      style={{ bottom: keyboard }}
    >
      {exerciseActions}
      <div className="workout-timer-row">
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="workout-timer-trigger"
              aria-label={`Workout Timer · ${state}`}
            >
              <span className="timer-digits">
                {timerLabel(readError ? null : seconds)}
              </span>
              <span className="timer-state">{state}</span>
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="workout-panel-overlay" />
            <Dialog.Content
              className="workout-panel"
              aria-describedby="timer-description"
            >
              <Dialog.Title>Workout Timer</Dialog.Title>
              <Dialog.Description id="timer-description">
                Session time excluding manual pauses. Inactive gaps are not
                measured exercise time.
              </Dialog.Description>
              <p className="timer-digits">
                {timerLabel(
                  readError ? value?.effective_elapsed_seconds : seconds,
                )}
              </p>
              <p role="status">{state}</p>
              {!!value?.idle_intervals.length && (
                <p className="set-source">Includes an inactive interval.</p>
              )}
              {value && !value.last_activity_at && !closed && (
                <p className="set-source">
                  Resume this older workout or save an activity before pausing
                  its timer.
                </p>
              )}
              {(error || readError) && <p role="alert">{error || readError}</p>}
              <Button
                type="button"
                disabled={
                  busy ||
                  disabled ||
                  closed ||
                  value?.timer_revision === undefined ||
                  !value?.last_activity_at
                }
                onClick={() => void changePause()}
              >
                {busy
                  ? "Saving timer…"
                  : retrying
                    ? "Retry timer change"
                    : paused
                      ? "Resume Workout"
                      : "Pause Workout"}
              </Button>
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Dismiss timer
                </Button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <div className="workout-footer-actions">
        <Button asChild variant="outline">
          <Link
            href={backHref}
            onClick={closure?.cancel}
            aria-label={home ? "Back to app" : "Back to Workout Home"}
          >
            Back
          </Link>
        </Button>
        <InlineAbandon />
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={closed || closure?.pending}
              onClick={closure?.cancel}
            >
              {closure?.pending ? "Finishing…" : "Finish"}
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="workout-panel-overlay" />
            <Dialog.Content className="workout-panel workout-end-panel">
              <Dialog.Title>End workout?</Dialog.Title>
              <Dialog.Description>
                Review saved work before closing this session.
              </Dialog.Description>
              {children}
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Keep training
                </Button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </nav>
  );
}
