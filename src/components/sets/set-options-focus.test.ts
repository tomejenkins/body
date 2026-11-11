import { expect, it } from "vitest";
import { collapseSetOptions } from "./set-options-focus";
function fixture() {
  document.body.innerHTML =
    '<details open><summary>Options</summary><input value="125"></details><button>Other row</button>';
  const panel = document.querySelector("details");
  const input = document.querySelector("input");
  const summary = document.querySelector("summary");
  const other = document.querySelector("button");
  if (!panel || !input || !summary || !other) throw Error("Missing fixture");
  return { panel, input, summary, other };
}
it("closes the panel and returns hidden control focus to its visible summary", () => {
  const { panel, input, summary } = fixture();
  input.focus();
  collapseSetOptions(panel);
  expect(panel.open).toBe(false);
  expect(summary).toHaveFocus();
  expect(input.value).toBe("125");
});
it("does not steal focus from another row", () => {
  const { panel, other } = fixture();
  other.focus();
  collapseSetOptions(panel);
  expect(panel.open).toBe(false);
  expect(other).toHaveFocus();
});
it("preserves focus already on the summary", () => {
  const { panel, summary } = fixture();
  summary.focus();
  collapseSetOptions(panel);
  expect(panel.open).toBe(false);
  expect(summary).toHaveFocus();
});
