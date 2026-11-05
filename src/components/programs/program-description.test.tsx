import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProgramDescription, safeDescriptionLink } from "./program-description";
it("renders only controlled prose elements and safe links", () => {
  const { container } = render(
    <ProgramDescription
      text={
        '## Guide\n\nA **strong** and *steady* start.\n\n- First\n- Second\n\n1. Rest\n2. Repeat\n\n> Be patient\n\n[Safe](https://example.com/guide) [Local](/exercises/test) [Unsafe](javascript:alert(1))\n\n<script>alert(1)</script><iframe src="https://evil.test"></iframe>'
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "Guide" })).toBeInTheDocument();
  expect(container.querySelector("strong")).toHaveTextContent("strong");
  expect(container.querySelector("em")).toHaveTextContent("steady");
  expect(container.querySelectorAll("li")).toHaveLength(4);
  expect(screen.getByRole("link", { name: "Safe" })).toHaveAttribute(
    "href",
    "https://example.com/guide",
  );
  expect(container).toHaveTextContent("Unsafe");
  expect(
    screen.queryByRole("link", { name: "Unsafe" }),
  ).not.toBeInTheDocument();
  expect(container.querySelector("script,iframe,img,style")).toBeNull();
});
it("rejects unsafe protocols, protocol-relative and credentialed URLs", () => {
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,evil",
    "//evil.test",
    "https://user:password@example.com",
    "file:///tmp/test",
  ])
    expect(safeDescriptionLink(link)).toBeNull();
  expect(safeDescriptionLink("https://example.com")).toBe(
    "https://example.com/",
  );
});
