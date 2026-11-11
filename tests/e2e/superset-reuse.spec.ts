import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verifiedAccount } from "./auth-helpers";
import { loginSelection } from "./selection-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };

test.setTimeout(120000);
async function retention(page: Page, kind: "archive" | "restore" | "delete") {
  const manage = page.getByRole("region", {
    name: "Manage Workout",
    exact: true,
  });
  const label =
    kind === "archive"
      ? "Archive Workout"
      : kind === "restore"
        ? "Restore Workout"
        : "Delete Workout";
  await manage.getByRole("button", { name: label, exact: true }).click();
  await manage.getByRole("checkbox").check();
  await manage
    .getByRole("button", {
      name:
        kind === "archive"
          ? "Confirm Archive"
          : kind === "restore"
            ? "Restore Workout"
            : "Delete Permanently",
      exact: true,
    })
    .click();
  if (kind === "delete")
    await expect(page).toHaveURL(/history\?message=deleted$/);
  else if (kind === "archive")
    await expect(
      page.getByText("Archived Workout", { exact: true }),
    ).toBeVisible();
  else
    await expect(
      page.getByText("Archived Workout", { exact: true }),
    ).toHaveCount(0);
}
test("one-tap grouped Favorite, reused actual-free structure and source archive/restore/delete", async ({
  page,
}, info) => {
  const a = await verifiedAccount();
  const exercises = ["barbell_bench_press", "standing_dumbbell_curl"].map(
    (slug) => catalog.exercises.find((e) => e.slug === slug)!.id,
  );
  const w = await a.client.rpc("start_exercise_workout", {
    p_exercises: exercises,
    p_request: randomUUID(),
  });
  expect(w.error).toBeNull();
  const movements = await a.client
    .from("workout_movements")
    .select("id")
    .eq("workout_session_id", w.data)
    .order("position");
  expect(movements.error).toBeNull();
  expect(
    (
      await a.client.rpc("change_workout_group", {
        p_session: w.data,
        p_group: randomUUID(),
        p_operation: "create",
        p_expected: 0,
        p_members: movements.data!.map((m) => ({ type: "movement", id: m.id })),
        p_request: randomUUID(),
      })
    ).error,
  ).toBeNull();
  const items = await a.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", w.data);
  for (const item of items.data!) {
    const sets = await a.client
      .from("workout_sets")
      .select("id,revision")
      .eq("workout_exercise_id", item.id)
      .order("position");
    for (const s of sets.data!)
      expect(
        (
          await a.client.rpc("log_workout_set", {
            p_item: item.id,
            p_id: s.id,
            p_revision: s.revision,
            p_mutation: randomUUID(),
            p_operation: "save",
            p_reps: 8,
            p_weight: 50,
            p_completed: true,
          })
        ).error,
      ).toBeNull();
  }
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: w.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  await loginSelection(page, a);
  await page.goto(`/history/${w.data}`);
  await expect(page.locator(".history-superset")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved to Favorites", exact: true }),
  ).toBeDisabled();
  const fav = await a.client
    .from("favorite_workouts")
    .select("id,definition")
    .eq("source_session_id", w.data)
    .single();
  expect(fav.error).toBeNull();
  await page.goto("/workout");
  const card = page.locator(".favorite-shortcut").first();
  await card.getByRole("button", { name: /^Start / }).click();
  await expect(page).toHaveURL(/workout\/[0-9a-f-]{36}$/);
  const launched = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.locator(".superset-card")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("favorite-group-remapped.png"),
    fullPage: true,
  });
  const selections = await a.client
    .from("workout_exercises")
    .select("id")
    .eq("workout_session_id", launched);
  expect(
    (
      await a.client
        .from("workout_sets")
        .select("status,actual_reps,actual_weight_kg,inputs_confirmed")
        .in(
          "workout_exercise_id",
          selections.data!.map((e) => e.id),
        )
    ).data!.every(
      (s) =>
        s.status === "pending" &&
        s.actual_reps === null &&
        s.actual_weight_kg === null &&
        !s.inputs_confirmed,
    ),
  ).toBe(true);
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: launched,
        p_outcome: "abandoned",
      })
    ).error,
  ).toBeNull();
  await page.goto(`/history/${w.data}`);
  await retention(page, "archive");
  await expect(page.locator(".history-superset")).toHaveCount(1);
  await retention(page, "restore");
  await expect(page.locator(".history-superset")).toHaveCount(1);
  await retention(page, "delete");
  expect(
    (
      await a.client
        .from("workout_group_commands")
        .select("request_id")
        .eq("workout_session_id", w.data)
    ).data,
  ).toEqual([]);
  expect(
    (
      await a.client
        .from("favorite_workouts")
        .select("definition")
        .eq("id", fav.data!.id)
        .single()
    ).data!.definition,
  ).toEqual(fav.data!.definition);
});
