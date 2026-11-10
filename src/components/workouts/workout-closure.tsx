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
  const confirm = useRef<HTMLButtonElement>(null),
    cancelFocus = useRef(false);
  useEffect(() => {
    if (c?.armed) confirm.current?.focus({ preventScroll: true });
  }, [c?.armed]);
  if (!c) return null;
  return (
    <div className="inline-abandon">
      {c.armed ? (
        <>
          <form action={c.action} onSubmit={c.submit}>
            <input type="hidden" name="sessionId" value={c.session} />
            <input type="hidden" name="outcome" value="abandoned" />
            <Button
              type="submit"
              ref={confirm}
              variant="destructive"
              disabled={c.disabled || c.pending}
              aria-busy={c.pending}
            >
              {c.pending ? "Closing workout…" : "Confirm Abandon"}
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            disabled={c.pending}
            onClick={() => {
              cancelFocus.current = true;
              c.cancel();
            }}
            aria-label="Cancel abandonment"
          >
            Cancel
          </Button>
          <span className="sr-only" role="status">
            Confirm abandonment to close this workout. It is still active until
            confirmed.
          </span>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={c.disabled || c.pending}
          ref={(node) => {
            if (node && cancelFocus.current) {
              node.focus({ preventScroll: true });
              cancelFocus.current = false;
            }
          }}
          onClick={c.arm}
        >
          Abandon
        </Button>
      )}
      {c.armed && c.state.error && (
        <p role="alert" className="auth-error">
          {c.state.error}
        </p>
      )}
    </div>
  );
}
