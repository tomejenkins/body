"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import type { SelectionState } from "@/features/workout-selection/model";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveFavorite } from "@/features/workout-selection/actions";
export function SaveFavoriteButton({
  type,
  source,
  day,
  request,
  saved,
}: {
  type: "program_day" | "completed_ad_hoc" | "completed_workout";
  source: string;
  day?: string;
  request: string;
  saved: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (
      previous: SelectionState,
      form: FormData,
    ): Promise<SelectionState> => {
      try {
        return await saveFavorite(previous, form);
      } catch (error) {
        unstable_rethrow(error);
        return {
          error: "Save could not be confirmed. Retry, or refresh Favorites.",
        };
      }
    },
    {},
  );
  const [requestId] = useState(request);
  const submitting = useRef(false);
  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending, state]);
  const confirmed = saved || !!state.success;
  return (
    <form
      action={action}
      className="save-favorite"
      onSubmit={(e) => {
        if (submitting.current || pending || confirmed) e.preventDefault();
        else submitting.current = true;
      }}
    >
      <input type="hidden" name="sourceType" value={type} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="request" value={requestId} />
      {day && <input type="hidden" name="day" value={day} />}
      <Button
        type="submit"
        variant="outline"
        disabled={pending || confirmed}
        aria-busy={pending}
      >
        {confirmed ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Bookmark size={16} aria-hidden="true" />
        )}
        {pending
          ? "Saving…"
          : confirmed
            ? "Saved to Favorites"
            : "Save as Favorite"}
      </Button>
      {state.error && <p role="alert">{state.error}</p>}
      {confirmed && (
        <span className="sr-only" role="status">
          Saved to Favorites
        </span>
      )}
    </form>
  );
}
