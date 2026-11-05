import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProgramCover, programCoverPath } from "./program-cover";
it("restricts paths to controlled original assets and falls back on missing media", () => {
  for (const path of [
    "https://evil.test/image.svg",
    "/media/programs/../../evil.svg",
    "/media/programs/unknown.svg",
    undefined,
  ])
    expect(programCoverPath(path)).toBe("/media/programs/fallback.svg");
  const { rerender } = render(<ProgramCover title="Plan" media={null} />);
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringMatching(/\/media\/programs\/fallback\.svg$/),
  );
  rerender(
    <ProgramCover
      title="Plan"
      media={{
        asset_path: "/media/programs/full-body-foundation.svg",
        alt_text: "Original graphic",
      }}
    />,
  );
  const image = screen.getByRole("img");
  expect(image).toHaveAttribute(
    "src",
    expect.stringMatching(/\/media\/programs\/full-body-foundation\.svg$/),
  );
  fireEvent.error(image);
  expect(image).toHaveAttribute(
    "src",
    expect.stringMatching(/\/media\/programs\/fallback\.svg$/),
  );
});
