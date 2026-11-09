import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/components/workouts/selection-form", () => ({
  SelectionForm: ({
    label,
    fields,
  }: {
    label: string;
    fields: Record<string, string | number>;
  }) => <button data-day={fields.day}>{label}</button>,
}));
import { TrainingWeek } from "./training-week";
import type { Schedule } from "@/features/scheduling/model";
const s: Schedule = {
  assignmentId: "a",
  version: "v",
  configured: true,
  state: "active",
  timezone: "America/New_York",
  from: "2026-11-09",
  until: "2026-11-16",
  today: "2026-11-09",
  next: {
    dayId: "day",
    name: "Back",
    rotation: 1,
    number: 2,
    position: 3,
    dueOn: "2026-11-08",
    readyOn: "2026-11-09",
    recommendedOn: "2026-11-09",
    completedRotations: 0,
  },
  progress: {
    workIndex: 4,
    decisionRevision: 2,
    position: 3,
    rotation: 1,
    complete: false,
    completedRotations: 0,
    lastTrainingOn: null,
    lastCompleted: null,
  },
};
it("renders seven accessible dates, separate today/selection, current recommendation and future without a start", () => {
  render(
    <TrainingWeek
      schedule={s}
      events={[
        {
          assignmentId: "a",
          date: s.today!,
          kind: "workout",
          status: "due",
          name: "Back",
          recommended: true,
          carried: true,
          originalDueOn: "2026-11-08",
        },
        {
          assignmentId: "a",
          date: "2026-11-10",
          kind: "rest",
          status: "planned_rest",
          name: "Rest",
          recommended: false,
        },
      ]}
      activeSession={null}
      request="nonce"
    />,
  );
  const dates = screen
    .getByRole("group", { name: "Seven-day training schedule" })
    .querySelectorAll("button");
  expect(dates).toHaveLength(7);
  expect(dates[0]).toHaveAttribute("aria-current", "date");
  expect(screen.getByRole("button", { name: "Start Workout" })).toHaveAttribute(
    "data-day",
    "day",
  );
  dates[0].focus();
  fireEvent.keyDown(dates[0], { key: "ArrowRight" });
  expect(dates[1]).toHaveFocus();
  expect(dates[1]).toHaveAttribute("aria-pressed", "true");
  expect(dates[0]).toHaveAttribute("aria-current", "date");
  expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
  expect(screen.getByText("Planned recovery")).toBeVisible();
  fireEvent.click(dates[2]);
  expect(screen.getByText("No scheduled activity.")).toBeVisible();
  expect(screen.queryByText("Rest Day")).toBeNull();
});
it("keeps partial training and acceptance separately accessible with the actual history reference", () => {
  const e = {
    assignmentId: "a",
    date: "2026-11-09",
    kind: "workout" as const,
    name: "Back",
    recommended: false,
    sessionId: "saved",
  };
  render(
    <TrainingWeek
      schedule={s}
      events={[
        { ...e, status: "recorded_partial" },
        { ...e, status: "accepted_partial" },
      ]}
      activeSession="active"
      request="nonce"
    />,
  );
  expect(
    screen.getByRole("region", { name: "Training on 2026-11-09" }),
  ).toHaveAttribute("tabindex", "0");
  expect(screen.getByText("Partial training recorded")).toBeVisible();
  expect(screen.getByText("Partial accepted · scheduling only")).toBeVisible();
  expect(screen.getAllByRole("link", { name: "View Workout" })).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Resume Workout" })).toHaveAttribute(
    "href",
    "/workout/active",
  );
  expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
});
it("shows useful empty/configuration states without invented dates or automatic timezone writes", () => {
  const { rerender } = render(
    <TrainingWeek
      schedule={null}
      events={[]}
      activeSession={null}
      request="nonce"
    />,
  );
  expect(
    screen.getByRole("link", { name: "Start Other Workout" }),
  ).toHaveAttribute("href", "/workout/new");
  expect(screen.getByRole("link", { name: "Browse Programs" })).toBeVisible();
  expect(
    screen.queryByRole("group", { name: "Seven-day training schedule" }),
  ).toBeNull();
  rerender(
    <TrainingWeek
      schedule={{ assignmentId: "a", configured: false, state: "active" }}
      events={[]}
      activeSession={null}
      request="nonce"
    />,
  );
  expect(
    screen.getByRole("link", { name: "Configure Calendar" }),
  ).toHaveAttribute("href", "/programs#program-calendar");
});
