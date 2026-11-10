import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/components/workouts/save-favorite", () => ({
  SaveFavorite: () => <button>Save Favorite</button>,
}));
vi.mock("@/components/history/local-time", () => ({
  LocalTime: ({ value }: { value: string }) => <time>{value}</time>,
}));
import { WorkoutComplete } from "./workout-complete";
import type { Workout } from "@/features/workouts/types";
import type { loadCompletion } from "@/features/completion/queries";
import type { Achievement } from "@/features/records/model";
const w: Workout = {
  id: "session",
  name: "Saved session",
  userId: "owner",
  status: "completed",
  completionStatus: "partial",
  startedAt: "2026-11-09T10:00:00Z",
  finishedAt: "2026-11-09T11:00:00Z",
  items: [],
  weightUnit: "kg",
};
const summary: Awaited<ReturnType<typeof loadCompletion>> = {
  statistics: { session_id: w.id, working_sets: 2, exercises_performed: 1 },
  achievements: { featured: [], additional: [] },
  outcomes: [],
  suggestions: {},
  favorite: {
    source: { type: "completed_ad_hoc", source: w.id, key: w.id },
    saved: null,
    atCapacity: false,
    eligible: true,
  },
};
it("shows persisted counts, useful no-PR confirmation, private disabled Feed and safe navigation", () => {
  render(<WorkoutComplete workout={w} summary={summary} />);
  expect(
    screen.getByRole("heading", { name: "Workout Complete!" }),
  ).toBeVisible();
  expect(
    screen.getByLabelText("Completed qualifying working sets"),
  ).toHaveTextContent("2");
  expect(screen.getByText("Another session in the books.")).toBeVisible();
  const share = screen.getByRole("button", {
    name: "Share to Feed · Coming Later",
  });
  expect(share).toBeDisabled();
  expect(share.closest("form")).toBeNull();
  expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  expect(
    screen.getByRole("link", { name: "View Full Workout" }),
  ).toHaveAttribute("href", "/history/session");
});
it("keeps partial acceptance separate and suppresses repeated/ineligible Favorite actions", () => {
  const { rerender } = render(
    <WorkoutComplete
      workout={{ ...w, isProgram: true }}
      summary={{
        ...summary,
        outcomes: [{ movement: 1, required: 3, completed: 1, repsAchieved: 1 }],
        favorite: {
          ...summary.favorite,
          saved: { id: "favorite", name: "Already saved" },
        },
      }}
    />,
  );
  expect(screen.getByText("Partial Workout")).toBeVisible();
  expect(screen.getByText(/0\/1 movements complete/)).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Review program schedule" }),
  ).toHaveAttribute("href", "/workout?decisions=program#schedule-decisions");
  expect(screen.queryByRole("button", { name: "Save Favorite" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Saved as Favorite");
  rerender(
    <WorkoutComplete
      workout={w}
      summary={{
        ...summary,
        favorite: { ...summary.favorite, eligible: false },
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Save Favorite" })).toBeNull();
});
it("features three records and defers additional achievement HTML until explicitly requested", () => {
  const record: Achievement = {
    exercise_id: "e",
    exercise_name: "Press",
    session_id: w.id,
    category: "loaded",
    metric: "actual_rm",
    load_key: 5,
    value: 60,
    previous_value: 50,
    set_id: "z",
    performed_at: w.finishedAt!,
    weight_kg: 60,
    reps: 5,
    entered_weight: 60,
    entered_unit: "kg",
  };
  const data = {
    ...summary,
    achievements: {
      featured: [
        record,
        { ...record, exercise_id: "f" },
        { ...record, exercise_id: "g" },
      ],
      additional: [
        { ...record, exercise_id: "h", metric: "estimated_1rm" as const },
      ],
    },
  };
  const { container, rerender } = render(
    <WorkoutComplete workout={w} summary={data} />,
  );
  expect(container.querySelectorAll(".achievement-card")).toHaveLength(3);
  expect(screen.queryByText("Estimated 1RM")).toBeNull();
  expect(
    screen.getByRole("link", { name: "View All Achievements (4)" }),
  ).toHaveAttribute(
    "href",
    "/workout/session/complete?achievements=all#all-achievements",
  );
  rerender(<WorkoutComplete workout={w} summary={data} showAllAchievements />);
  expect(container.querySelectorAll(".achievement-card")).toHaveLength(4);
  expect(screen.getByText("Estimated 1RM")).toBeVisible();
});

it("shows honest empty and unsupported states without implying qualifying training", () => {
  render(
    <WorkoutComplete
      workout={{
        ...w,
        items: [{ loggingKind: "duration" } as Workout["items"][number]],
      }}
      summary={{
        ...summary,
        statistics: {
          session_id: w.id,
          working_sets: 0,
          exercises_performed: 0,
        },
        favorite: { ...summary.favorite, eligible: false },
      }}
    />,
  );
  expect(screen.getByText("Workout saved.")).toBeVisible();
  expect(screen.queryByText("Another session in the books.")).toBeNull();
  expect(
    screen.getByText("No qualifying working sets were recorded."),
  ).toBeVisible();
  expect(screen.getByText("Strength sets")).toBeVisible();
  expect(
    screen.getByText(/Other legacy timed or assisted entries/),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save Favorite" })).toBeNull();
});
it("uses existing prescribed counts for an accessible set-progress display and keeps Next time expandable", () => {
  const { rerender } = render(
    <WorkoutComplete
      workout={{ ...w, isProgram: true }}
      summary={{
        ...summary,
        outcomes: [{ movement: 1, required: 3, completed: 1, repsAchieved: 1 }],
      }}
    />,
  );
  const progress = screen.getByRole("progressbar", {
    name: "Prescribed sets completed",
  });
  expect(progress).toHaveAttribute("value", "1");
  expect(progress).toHaveAttribute("max", "3");
  const details = screen.getByText("Training guidance").closest("details");
  expect(details).not.toHaveAttribute("open");
  expect(
    screen.getByText(
      "No load suggestion yet. Keep building recorded performance.",
    ),
  ).toBeInTheDocument();
  rerender(
    <WorkoutComplete
      workout={{ ...w, isProgram: true, completionStatus: "full" }}
      summary={{
        ...summary,
        outcomes: [{ movement: 1, required: 3, completed: 3, repsAchieved: 3 }],
      }}
    />,
  );
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
  expect(screen.getByText("Program workout saved")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Review program schedule" }),
  ).toBeNull();
});
