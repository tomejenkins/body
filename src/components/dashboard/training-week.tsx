"use client";
import Link from "next/link";
import { CalendarClock, SkipForward, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectionForm } from "@/components/workouts/selection-form";
import {
  dateOffset,
  scheduleStatus,
  type Schedule,
} from "@/features/scheduling/model";
import {
  dayEvents,
  eventLabel,
  recommendationFields,
  statusSymbol,
  type TrainingEvent,
} from "@/features/scheduling/training-week";
function StatusIndicator({ status }: { status: TrainingEvent["status"] }) {
  const Icon =
    status === "deferred"
      ? CalendarClock
      : status === "skipped"
        ? SkipForward
        : status === "defer_cancelled"
          ? Undo2
          : null;
  return Icon ? (
    <Icon size={14} aria-hidden="true" />
  ) : (
    <>{statusSymbol[status]}</>
  );
}
const fullDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
export function TrainingWeek({
  schedule: s,
  events,
  activeSession,
  request,
  truncated = false,
}: {
  schedule: Schedule | null;
  events: TrainingEvent[];
  activeSession: string | null;
  request: string;
  truncated?: boolean;
}) {
  const initial =
    s?.today && s.from && s.until && s.today >= s.from && s.today < s.until
      ? s.today
      : (s?.from ?? "");
  const [selected, setSelected] = useState(initial);
  const configured = !!(
    s?.configured &&
    s.from &&
    s.today &&
    s.until &&
    s.timezone
  );
  const from = s?.from;
  const dates =
    configured && from
      ? Array.from({ length: 7 }, (_, i) => dateOffset(from, i))
      : [];
  const selectedEvents = dayEvents(events, selected),
    fields = s ? recommendationFields(s) : null;
  const canStart =
    fields && selected === s?.today && s.next?.recommendedOn === s.today;
  return (
    <section
      className="training-week"
      id="training-week"
      aria-label="Your Training Week"
    >
      <header className="training-week-heading">
        <h2>Your Training Week</h2>
        <Link
          prefetch={false}
          href={
            configured && s?.from
              ? `/programs?week=${s.from}#program-calendar`
              : "/programs#program-calendar"
          }
        >
          View Full Schedule
        </Link>
      </header>
      {activeSession && (
        <p className="training-active" role="status">
          Workout in progress · Your saved work is ready.
        </p>
      )}
      {!configured ? (
        <div className="training-week-empty">
          <p>
            {s
              ? "Set your calendar’s start date and timezone in Programs."
              : "Follow a program to see your training week."}
          </p>
          <div className="training-week-actions">
            {activeSession ? (
              <Button asChild>
                <Link prefetch={false} href={`/workout/${activeSession}`}>
                  Resume Workout
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link prefetch={false} href="/workout/new">
                  Start Other Workout
                </Link>
              </Button>
            )}
            <Link prefetch={false} href="/programs#program-calendar">
              {s ? "Configure Calendar" : "Browse Programs"}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {s?.next && s.next.recommendedOn !== s.today && (
            <aside
              className="training-next-summary"
              aria-label="Next program workout"
            >
              <span>Next workout</span>
              <h3>{s.next.name}</h3>
              <p>
                <time dateTime={s.next.recommendedOn}>
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${s.next.recommendedOn}T12:00:00Z`))}
                </time>
              </p>
            </aside>
          )}
          <nav
            className="training-week-navigation"
            aria-label="Training week navigation"
          >
            <Link
              prefetch={false}
              aria-label="Previous training week"
              href={`/dashboard?week=${dateOffset(dates[0], -7)}#training-week`}
              scroll={false}
            >
              ‹
            </Link>
            <span>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${dates[0]}T12:00:00Z`))}{" "}
              –{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${dates[6]}T12:00:00Z`))}
            </span>
            <Link
              prefetch={false}
              aria-label="Next training week"
              href={`/dashboard?week=${dateOffset(dates[0], 7)}#training-week`}
              scroll={false}
            >
              ›
            </Link>
          </nav>
          <div
            className="training-week-strip"
            role="group"
            aria-label="Seven-day training schedule"
          >
            {dates.map((date, i) => {
              const entries = dayEvents(events, date),
                first = entries[0];
              return (
                <button
                  type="button"
                  key={date}
                  aria-current={date === s?.today ? "date" : undefined}
                  aria-pressed={date === selected}
                  aria-label={`${fullDate(date)}${date === s?.today ? ", Today" : ""}: ${entries.length ? entries.map(eventLabel).join("; ") : "No scheduled activity"}`}
                  className={`training-date ${first ? `training-${first.status}` : "training-empty"}`}
                  onClick={() => setSelected(date)}
                  onKeyDown={(e) => {
                    const offset =
                      e.key === "ArrowRight"
                        ? Math.min(i + 1, 6)
                        : e.key === "ArrowLeft"
                          ? Math.max(i - 1, 0)
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? 6
                              : null;
                    if (offset !== null) {
                      e.preventDefault();
                      setSelected(dates[offset]);
                      const buttons =
                        e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                          "button",
                        );
                      buttons?.[offset]?.focus();
                    }
                  }}
                >
                  <span className="training-weekday">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </span>
                  <time dateTime={date}>{Number(date.slice(8))}</time>
                  <span className="training-date-indicator" aria-hidden="true">
                    {first ? <StatusIndicator status={first.status} /> : "·"}
                    {entries.length > 1 && <small>+{entries.length - 1}</small>}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="training-day-details"
            tabIndex={0}
            role="region"
            aria-label={`Training on ${selected}`}
            aria-live="polite"
          >
            <p className="training-detail-date">
              {fullDate(selected)}
              {selected === s?.today ? " · Today" : ""}
            </p>
            {selectedEvents.length ? (
              <ul>
                {selectedEvents.map((e, i) => (
                  <li
                    key={`${e.sessionId ?? e.dayId ?? "rest"}-${e.status}-${i}`}
                  >
                    <h3>{e.status === "planned_rest" ? "Rest Day" : e.name}</h3>
                    <p>
                      {e.source === "independent"
                        ? "Independent training · "
                        : e.source === "other_program"
                          ? "Other program training · "
                          : ""}
                      {e.recommended && e.status === "due"
                        ? "Recommended"
                        : e.status === "planned_rest"
                          ? "Planned recovery"
                          : e.status === "overdue"
                            ? "Not completed · Carried forward"
                            : scheduleStatus[e.status]}
                      {e.carried && e.status !== "overdue"
                        ? ` · Carried from ${e.originalDueOn}`
                        : ""}
                      {e.targetDate ? ` · Until ${e.targetDate}` : ""}
                    </p>
                    {e.sessionId &&
                      [
                        "completed",
                        "recorded_partial",
                        "accepted_partial",
                      ].includes(e.status) && (
                        <Link prefetch={false} href={`/history/${e.sessionId}`}>
                          View Workout
                        </Link>
                      )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No scheduled activity.</p>
            )}
          </div>
          {s?.programComplete && (
            <p className="set-source">
              Program complete. Your training history remains available.
            </p>
          )}
          <div className="training-week-actions">
            {activeSession ? (
              <Button asChild>
                <Link prefetch={false} href={`/workout/${activeSession}`}>
                  Resume Workout
                </Link>
              </Button>
            ) : canStart && fields ? (
              <SelectionForm
                kind="start"
                fields={{ ...fields, request }}
                label="Start Workout"
              />
            ) : (
              selected === s?.today && (
                <Button variant="outline" asChild>
                  <Link prefetch={false} href="/workout/new">
                    Start Other Workout
                  </Link>
                </Button>
              )
            )}
            {!activeSession && fields && (
              <Link
                prefetch={false}
                href="/workout?choices=program#program-workout-options"
              >
                Choose a different program workout
              </Link>
            )}
          </div>

          {truncated && (
            <p className="set-source">
              Some training is not shown.{" "}
              <Link prefetch={false} href="/history">
                View all history
              </Link>
              .
            </p>
          )}
          <p className="training-week-note">
            {s?.timezone} · Unfinished workouts carry forward.
          </p>
        </>
      )}
    </section>
  );
}
