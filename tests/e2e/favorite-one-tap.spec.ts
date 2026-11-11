import { test, expect } from "@playwright/test";
import { verifiedAccount } from "./auth-helpers";
import {
  selectionProgram,
  loginSelection,
  type Account,
} from "./selection-helpers";
import { favoriteEditor, renameFavorite } from "./favorite-helpers";
import catalog from "../../supabase/catalog/exercises.json" with { type: "json" };
test.setTimeout(120000);
async function independent(a: Account, name: string) {
  const exercise = catalog.exercises.find(
    (e) => e.slug === "barbell_bench_press",
  )!.id;
  const w = await a.client.rpc("start_exercise_workout", {
    p_exercises: [exercise],
    p_request: crypto.randomUUID(),
  });
  expect(w.error).toBeNull();
  await a.client.from("workout_sessions").update({ name }).eq("id", w.data);
  const item = (
    await a.client
      .from("workout_exercises")
      .select("id")
      .eq("workout_session_id", w.data)
      .single()
  ).data!;
  const row = (
    await a.client
      .from("workout_sets")
      .select("id,revision")
      .eq("workout_exercise_id", item.id)
      .order("position")
      .limit(1)
      .single()
  ).data!;
  expect(
    (
      await a.client.rpc("log_workout_set", {
        p_item: item.id,
        p_id: row.id,
        p_revision: row.revision,
        p_mutation: crypto.randomUUID(),
        p_operation: "save",
        p_reps: 8,
        p_weight: 50,
        p_completed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await a.client.rpc("end_workout", {
        p_session: w.data,
        p_outcome: "completed",
      })
    ).error,
  ).toBeNull();
  return w.data as string;
}
test("one-tap recommended and alternative saves, stale device deduplication, compact menu and safe editing", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 4, 2);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  await loginSelection(page, a);
  await page.goto("/workout");
  const other = await page.context().newPage();
  await other.goto("/workout");
  const recommended = page.getByRole("region", { name: "Recommended workout" });
  await expect(page.getByLabel("Favorite name")).toHaveCount(0);
  await expect(page.locator("details.save-favorite")).toHaveCount(0);
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    intercepted = new Promise<void>((resolve) => (arrived = resolve));
  let held = false;
  await page.route("**/workout", async (route) => {
    if (route.request().method() === "POST" && !held) {
      held = true;
      arrived();
      await gate;
    }
    await route.continue();
  });
  await recommended
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await intercepted;
  await expect(
    recommended.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await expect(
    recommended.getByRole("button", {
      name: "Saved to Favorites",
      exact: true,
    }),
  ).toHaveCount(0);
  release();
  await expect(
    recommended.getByRole("button", {
      name: "Saved to Favorites",
      exact: true,
    }),
  ).toBeDisabled();
  await page.unroute("**/workout");
  await other
    .getByRole("region", { name: "Recommended workout" })
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    other
      .getByRole("region", { name: "Recommended workout" })
      .getByRole("button", { name: "Saved to Favorites", exact: true }),
  ).toBeDisabled();
  await other.close();
  expect(
    (await a.client.from("favorite_workouts").select("name")).data,
  ).toEqual([{ name: "Training 1" }]);
  await page.locator(".program-workout-options > summary").click();
  const alternative = page
    .locator(".program-workout-options li")
    .filter({ hasText: "Training 2" });
  await alternative
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    alternative.getByRole("button", {
      name: "Saved to Favorites",
      exact: true,
    }),
  ).toBeDisabled();
  const before = (await a.client.rpc("program_schedule")).data.progress;
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page
        .getByRole("button", { name: "Manage Training 1", exact: true })
        .click();
      const menu = page.getByRole("menu"),
        box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      expect(
        await menu.evaluate((el) => Number(getComputedStyle(el).zIndex)),
      ).toBeGreaterThan(40);
      const contrast = await menu.evaluate((el) => {
        const item = el.querySelector(".context-destructive")!;
        const ctx = document.createElement("canvas").getContext("2d")!;
        const luminance = (color: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const values = Array.from(ctx.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((v) => {
              const x = v / 255;
              return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            });
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const foreground = luminance(getComputedStyle(item).color),
          background = luminance(getComputedStyle(el).backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({
        path: info.outputPath(`menu-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Rename Favorite",
        exact: true,
      });
      await expect(dialog.getByLabel("New name")).toBeFocused();
      await page.screenshot({
        path: info.outputPath(`editor-${width}-${colorScheme}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await favoriteEditor(page, "Training 1", "Rename");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("favorite-editor-200-percent.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("font-size"),
  );
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

  const manage = page.getByRole("button", {
    name: "Manage Training 1",
    exact: true,
  });
  await manage.click();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await page.screenshot({
    path: info.outputPath("favorite-menu.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(manage).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await manage.click();
  await page.mouse.click(20, 80);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await manage.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  const editor = page.getByRole("dialog", {
    name: "Rename Favorite",
    exact: true,
  });
  await expect(editor.getByLabel("New name")).toBeFocused();
  await page.screenshot({
    path: info.outputPath("favorite-rename.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(manage).toBeFocused();
  await renameFavorite(page, "Training 1", "My presses");
  await page.reload();
  await expect(
    recommended.getByRole("button", {
      name: "Saved to Favorites",
      exact: true,
    }),
  ).toBeDisabled();
  const remove = await favoriteEditor(page, "My presses", "Remove");
  await remove
    .getByRole("button", { name: "Remove Favorite", exact: true })
    .click();
  expect(
    (
      await a.client
        .from("favorite_workouts")
        .select("id")
        .eq("archived", false)
    ).data,
  ).toHaveLength(2);
  await remove
    .getByLabel("Remove this shortcut; keep existing history")
    .check();
  await remove
    .getByRole("button", { name: "Remove Favorite", exact: true })
    .click();
  await expect(remove).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "My presses", exact: true }),
  ).toHaveCount(0);
  expect(
    (await a.client.from("workout_sessions").select("id")).data,
  ).toHaveLength(1);
  await expect(
    recommended.getByRole("button", { name: "Save as Favorite", exact: true }),
  ).toBeEnabled();
  await recommended
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    recommended.getByRole("button", {
      name: "Saved to Favorites",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "My presses", exact: true }),
  ).toBeVisible();
  expect(
    (
      await a.client
        .from("favorite_workouts")
        .select("id")
        .eq("archived", false)
    ).data,
  ).toHaveLength(2);
  expect((await a.client.rpc("program_schedule")).data.progress).toEqual(
    before,
  );
});
test("completion and history save source-default names with no title input or copied actual performance", async ({
  page,
}, info) => {
  const a = await verifiedAccount(),
    long = "Deliberate strength practice " + "x".repeat(110),
    id = await independent(a, long);
  await loginSelection(page, a);
  await page.goto(`/workout/${id}/complete`);
  await expect(page.getByLabel("Favorite name")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to Favorites" }),
  ).toBeVisible();
  let favorites = (await a.client.rpc("workout_start_options")).data.favorites;
  expect(favorites).toHaveLength(1);
  expect(favorites[0].name).toBe(long.slice(0, 100));
  const second = await independent(a, "Upper body practice");
  await page.goto(`/history/${second}`);
  await page
    .getByRole("button", { name: "Save as Favorite", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved to Favorites", exact: true }),
  ).toBeDisabled();
  favorites = (await a.client.rpc("workout_start_options")).data.favorites;
  expect(favorites.map((f: { name: string }) => f.name)).toContain(
    "Upper body practice",
  );
  const started = await a.client.rpc("start_favorite_workout", {
    p_favorite: favorites[0].id,
    p_request: crypto.randomUUID(),
  });
  expect(started.error).toBeNull();
  // Sets are scoped through their actual selections, not a caller-created snapshot.
  const entries = (
    await a.client
      .from("workout_exercises")
      .select("id")
      .eq("workout_session_id", started.data)
  ).data!;
  const actual = await a.client
    .from("workout_sets")
    .select("status,actual_reps,actual_weight_kg,inputs_confirmed")
    .in(
      "workout_exercise_id",
      entries.map((e) => e.id),
    );
  expect(actual.error).toBeNull();
  expect(
    actual.data!.every(
      (s) =>
        s.status === "pending" &&
        !s.inputs_confirmed &&
        s.actual_reps === null &&
        s.actual_weight_kg === null,
    ),
  ).toBe(true);
  await a.client.rpc("end_workout", {
    p_session: started.data,
    p_outcome: "abandoned",
  });
  await page.goto("/workout");
  await page.screenshot({
    path: info.outputPath("favorite-shortcuts.png"),
    animations: "disabled",
  });
});

test("foreign source IDs are denied and a failed transport remains retryable without false saved feedback", async ({
  page,
}) => {
  const a = await verifiedAccount(),
    p = await selectionProgram(a, 4, 2);
  await a.client.rpc("end_workout", {
    p_session: p.session,
    p_outcome: "abandoned",
  });
  const foreign = await verifiedAccount(),
    other = await selectionProgram(foreign, 4, 2);
  await loginSelection(page, a);
  await page.goto("/workout");
  const form = page.locator(".recommended-workout .save-favorite"),
    button = form.getByRole("button", {
      name: "Save as Favorite",
      exact: true,
    });
  const request = await form.locator('input[name="request"]').inputValue();
  await form.evaluate(
    (element, ids) => {
      element.addEventListener(
        "formdata",
        (event) => {
          const data = (event as FormDataEvent).formData;
          data.set("source", ids.source);
          data.set("day", ids.day);
        },
        { once: true },
      );
    },
    { source: other.version, day: other.days[0].id },
  );
  const submitted = page.waitForRequest(
    (r) => r.method() === "POST" && !!r.postData()?.includes(other.version),
    { timeout: 15000 },
  );
  await button.click();
  expect((await submitted).postData()).toContain(other.days[0].id);
  await expect(form.getByRole("alert")).toContainText("source unavailable");
  expect((await a.client.from("favorite_workouts").select("id")).data).toEqual(
    [],
  );
  let fail = true;
  await page.route("**/workout", (route) => {
    if (fail && route.request().method() === "POST") {
      fail = false;
      return route.abort("failed");
    }
    return route.continue();
  });
  await button.click();
  await expect(form.getByRole("alert")).toContainText("could not be confirmed");
  await expect(form.getByRole("status")).toHaveCount(0);
  expect(await form.locator('input[name="request"]').inputValue()).toBe(
    request,
  );
  await button.click();
  await expect(
    form.getByRole("button", { name: "Saved to Favorites", exact: true }),
  ).toBeDisabled();
  expect(
    (await a.client.from("favorite_workouts").select("name")).data,
  ).toEqual([{ name: "Training 1" }]);
  expect(
    (await foreign.client.from("favorite_workouts").select("id")).data,
  ).toEqual([]);
});
