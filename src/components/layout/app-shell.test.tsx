import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
vi.mock("next/navigation", () => ({ usePathname: () => "/workout" }));
describe("AppShell", () => {
  it("marks only the current route and exposes all six destinations", () => {
    render(
      <AppShell>
        <h1>Workout space</h1>
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.querySelectorAll("a")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Workout" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "Workout space" }),
    );
  });
});
