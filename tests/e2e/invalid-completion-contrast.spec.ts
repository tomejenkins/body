import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixture } from "../audit/helpers";
test("field errors meet text contrast in every requested mobile width and theme", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Single mobile color matrix");
  const { a } = await fixture(page),
    row = page.locator(".logged-set").nth(1),
    id = await row.getAttribute("data-set-id");
  await row.getByRole("textbox", { name: / reps$/ }).fill("");
  await row.getByRole("checkbox", { name: / complete$/ }).click();
  const errors = row.locator(".set-field-errors");
  await expect(errors).toContainText("Enter reps");
  const results = [];
  for (const width of [375, 390, 430])
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme });
      const contrast = await errors.evaluate((element) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) throw Error("Color probe unavailable");
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((value) => {
              const s = value / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const foreground = luminance(getComputedStyle(element).color),
          background = luminance(
            getComputedStyle(document.body).backgroundColor,
          );
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      results.push({ width, theme, contrast });
      await page.screenshot({
        path: info.outputPath(`feedback-${width}-${theme}.png`),
        fullPage: true,
        scale: "css",
      });
    }
  expect(
    (await a.client.from("workout_sets").select("status").eq("id", id).single())
      .data?.status,
  ).toBe("pending");
  await writeFile(
    info.outputPath("contrast.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
});
