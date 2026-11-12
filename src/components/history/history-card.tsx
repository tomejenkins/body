import Link from "next/link";
import { cardioMinutes } from "@/features/cardio/model";
import { ArrowUpRight, Trophy } from "lucide-react";
import { qualifiedDuration } from "@/features/continuity/model";
import {
  friendlyWorkoutName,
  historyStatus,
  type HistorySummary,
} from "@/features/history/model";
import { LocalTime } from "./local-time";
export function HistoryCard({
  workout: w,
  archived = false,
  compact = false,
}: {
  workout: HistorySummary;
  archived?: boolean;
  compact?: boolean;
}) {
  return (
    <Link className="training-history-card" href={`/history/${w.id}`}>
      <div className="history-card-heading">
        <div>
          <h2>{friendlyWorkoutName(w.name)}</h2>
          <LocalTime
            value={archived ? (w.finished_at ?? w.started_at) : w.started_at}
          />
        </div>
        <ArrowUpRight size={18} aria-hidden="true" />
      </div>
      <p className="history-card-status">
        {archived ? "Archived · " : ""}
        {historyStatus(
          w.status,
          w.completion_status,
          !!w.cardio_items && !w.exercise_count && !w.is_program,
        )}
      </p>
      <p className="history-card-counts">
        <span>
          <strong>{w.working_sets}</strong> completed working sets
        </span>
        <span>
          <strong>{w.exercise_count}</strong> exercises selected
        </span>
      </p>
      {!!w.cardio_items && (
        <p className="history-card-counts">
          Cardio · {cardioMinutes(w.cardio_seconds ?? 0)} recorded
        </p>
      )}
      {!compact && (
        <>
          <p className="history-card-metadata">
            {w.warm_up_sets} warm-up sets · {w.incomplete_sets} incomplete sets
          </p>
          <p className="history-card-metadata">
            {qualifiedDuration({
              started_at: w.started_at,
              finished_at: w.finished_at,
              effective_finished_at: w.effective_finished_at ?? null,
              duration_kind: w.duration_kind ?? "legacy",
              idle_intervals: w.idle_intervals ?? [],
              manual_pause_intervals: w.manual_pause_intervals,
            })}
          </p>
        </>
      )}
      {w.closure_reason === "inactivity" && (
        <p className="history-card-metadata">
          Closed after inactivity · Saved sets kept
        </p>
      )}
      {!!w.achievement_count && (
        <p className="history-card-record">
          <Trophy size={14} aria-hidden="true" />
          {w.achievement_count} personal best
          {w.achievement_count === 1 ? "" : "s"}
        </p>
      )}
      <span className="history-card-open">View workout →</span>
    </Link>
  );
}
