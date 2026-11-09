import Link from "next/link";
import { randomUUID } from "node:crypto";
import { loadProgramSchedule } from "@/features/scheduling/queries";
import {
  dateOffset,
  localDate,
  scheduleStatus,
} from "@/features/scheduling/model";
import { ScheduleSetup } from "./schedule-setup";
export async function ProgramCalendar({
  week,
  baseHref = "/programs",
}: {
  week?: unknown;
  baseHref?: string;
}) {
  const { schedule: s, timezone } = await loadProgramSchedule(week);
  if (!s?.configured || !s.from || !s.today)
    return (
      <section className="program-calendar" aria-label="Program calendar">
        <h2>Your calendar</h2>
        <p>
          {s
            ? "Choose a local start date to schedule your current program."
            : "Follow a program to see its adaptive calendar."}
        </p>
        <ScheduleSetup
          assignment={s?.assignmentId}
          timezone={timezone}
          request={randomUUID()}
          fallbackDate={localDate(timezone ?? "UTC")}
        />
      </section>
    );
  const from = s.from,
    today = s.today;
  const href = (date: string) =>
    `${baseHref}${baseHref.includes("?") ? "&" : "?"}week=${date}#program-calendar`;
  return (
    <section
      className="program-calendar"
      id="program-calendar"
      aria-label="Program calendar"
    >
      <div className="calendar-heading">
        <h2>Your calendar</h2>
        <span>{s.timezone}</span>
      </div>
      {s.next ? (
        <p className="schedule-recommendation">
          Next: {s.next.name} · {s.next.recommendedOn} · Rotation{" "}
          {s.next.rotation + 1}
          {s.next.dueOn < s.next.recommendedOn ? " · Carried forward" : ""}
        </p>
      ) : (
        <p>No pending scheduled workout.</p>
      )}
      <nav aria-label="Calendar weeks">
        <Link href={href(dateOffset(from, -7))}>← Previous week</Link>
        <span>{from}</span>
        <Link href={href(dateOffset(from, 7))}>Next week →</Link>
      </nav>
      <ol className="schedule-week" aria-label="Seven-day program schedule">
        {Array.from({ length: 7 }, (_, i) => dateOffset(from, i)).map(
          (date) => {
            const events = s.events?.filter((e) => e.date === date) ?? [];
            return (
              <li
                key={date}
                className={date === today ? "calendar-today" : ""}
                aria-current={date === today ? "date" : undefined}
              >
                <h3>
                  <time dateTime={date}>
                    {new Intl.DateTimeFormat("en", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${date}T12:00:00Z`))}
                  </time>
                  {date === today && <span>Today</span>}
                </h3>
                {events.length ? (
                  events.map((e, j) => (
                    <div
                      key={`${e.status}-${e.sessionId ?? j}`}
                      className={`calendar-event calendar-${e.status}`}
                    >
                      <p>{e.name}</p>
                      <span>
                        {scheduleStatus[e.status]}
                        {e.targetDate ? ` · Until ${e.targetDate}` : ""}
                        {e.recommended ? " · Recommended next" : ""}
                      </span>
                      {e.sessionId && e.status !== "overdue" && (
                        <Link href={`/history/${e.sessionId}`}>
                          View training
                        </Link>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="calendar-empty">
                    {date < (s.startDate ?? date)
                      ? "Not scheduled"
                      : date < today
                        ? "No scheduled training"
                        : "No projection"}
                  </p>
                )}
              </li>
            );
          },
        )}
      </ol>
      <p className="set-source">
        Unfinished workouts carry forward. Rest follows your recorded training;
        partial work stays recorded without completing the prescribed position.
      </p>
      <details>
        <summary>Calendar timezone</summary>
        <p>
          This assignment stays in {s.timezone}. Changing the default below
          applies to future assignments and preserves this calendar.
        </p>
        <ScheduleSetup
          timezone={timezone}
          request={randomUUID()}
          fallbackDate={today}
        />
      </details>
    </section>
  );
}
