"use client";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { unstable_rethrow } from "next/navigation";
import { endWorkout } from "@/features/workouts/actions";
import type { WorkoutState } from "@/features/workouts/types";
import { Button } from "@/components/ui/button";
type Closure = {
  session: string;
  pending: boolean;
  disabled: boolean;
  armed: boolean;
  arm: () => void;
  cancel: () => void;
  action: (form: FormData) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  state: WorkoutState;
};
const Context = createContext<Closure | null>(null);
export const useWorkoutClosure = () => useContext(Context);
export function WorkoutClosureProvider({
  session,
  disabled,
  children,
}: {
  session: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const mutex = useRef(false),
    [armedFor, setArmedFor] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    async (previous: WorkoutState, form: FormData) => {
      try {
        return await endWorkout(previous, form);
      } catch (error) {
        unstable_rethrow(error);
        return {
          error:
            "Your workout could not be closed. Refresh to check its current state, then retry.",
        };
      } finally {
        mutex.current = false;
      }
    },
    {},
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (mutex.current || disabled || pending) event.preventDefault();
    else mutex.current = true;
  };
  return (
    <Context.Provider
      value={{
        session,
        disabled,
        pending,
        armed: armedFor === session,
        arm: () => setArmedFor(session),
        cancel: () => setArmedFor(null),
        action,
        submit,
        state,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function FinishWorkout({ disabled }: { disabled: boolean }) {
  const c = useWorkoutClosure();
  if (!c) return null;
  return (
    <form action={c.action} onSubmit={c.submit}>
      <input type="hidden" name="sessionId" value={c.session} />
      <input type="hidden" name="outcome" value="completed" />
      <Button
        type="submit"
        disabled={c.disabled || disabled || c.pending}
        aria-busy={c.pending}
      >
        {c.pending ? "Closing workout…" : "Finish workout"}
      </Button>
      {c.state.error && !c.armed && (
        <p role="alert" className="auth-error">
          {c.state.error}
        </p>
      )}
    </form>
  );
}
export function InlineAbandon() {
  const c = useWorkoutClosure();
  const button = useRef<HTMLButtonElement>(null);
  const armed = c?.armed,
    pending = c?.pending,
    cancel = c?.cancel;
  useEffect(() => {
    if (!armed || pending) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !button.current?.contains(event.target)
      )
        cancel?.();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel?.();
    };
    const navigation = () => cancel?.();
    window.addEventListener("popstate", navigation);
    window.addEventListener("pagehide", navigation);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("popstate", navigation);
      window.removeEventListener("pagehide", navigation);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [armed, pending, cancel]);
  if (!c) return null;
  return (
    <div className="inline-abandon">
      <form
        action={c.action}
        onSubmit={(event) => {
          if (!c.armed) {
            event.preventDefault();
            if (!c.disabled && !c.pending) c.arm();
          } else c.submit(event);
        }}
      >
        <input type="hidden" name="sessionId" value={c.session} />
        <input type="hidden" name="outcome" value="abandoned" />
        <Button
          type={c.armed ? "submit" : "button"}
          ref={button}
          onClick={(event) => {
            if (!c.armed) {
              // Keep the initial SSR button inert until the local guard is armed.
              event.preventDefault();
              if (!c.disabled && !c.pending) c.arm();
            }
          }}
          variant={c.armed ? "destructive" : "outline"}
          disabled={c.disabled || c.pending}
          aria-busy={c.pending}
        >
          {c.pending ? "Closing…" : c.armed ? "Confirm Abandon" : "Abandon"}
        </Button>
      </form>
      {c.armed && (
        <span className="sr-only" role="status">
          Confirm abandonment to close this workout. Tap elsewhere or press
          Escape to keep training.
        </span>
      )}
      {c.armed && c.state.error && (
        <p role="alert" className="auth-error">
          {c.state.error}
        </p>
      )}
    </div>
  );
}
