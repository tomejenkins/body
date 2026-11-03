import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ExerciseThumbnail } from "./exercise-thumbnail";
it("recovers from unavailable images through movement, generic, then a safe placeholder", () => {
  render(
    <ExerciseThumbnail
      decorative={false}
      visual={{
        slug: "barbell_bench_press",
        ownerId: null,
        patternSlug: "horizontal_push",
      }}
    />,
  );
  expect(screen.getByRole("img").getAttribute("src")).toContain(
    "/exercise-thumbnails/barbell_bench_press.svg",
  );
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img").getAttribute("src")).toContain(
    "/movement-patterns/horizontal_push.svg",
  );
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img").getAttribute("src")).toContain(
    "/ui/exercise.svg",
  );
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveTextContent("↗");
});
