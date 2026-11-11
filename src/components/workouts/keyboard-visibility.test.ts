import { afterEach, expect, it, vi } from "vitest";
import { keyboardVisibility } from "./keyboard-visibility";
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
function setup() {
  document.body.innerHTML =
    '<div class="workout-execution"><input /><input /></div><footer></footer>';
  const field = document.querySelector("input");
  if (!field) throw Error("fixture");
  field.focus();
  vi.spyOn(field, "getBoundingClientRect").mockReturnValue({
    top: 450,
    bottom: 494,
  } as DOMRect);
  const scroll = vi.fn();
  field.scrollIntoView = scroll;
  const viewport = { offsetTop: 0, height: 400 } as VisualViewport;
  return { field, scroll, viewport };
}
it("does not scroll in response to viewport scroll events; reveals once on keyboard resize", () => {
  const { scroll, viewport } = setup(),
    reveal = keyboardVisibility();
  for (let i = 0; i < 10; i++) reveal(400, viewport, false, null);
  expect(scroll).not.toHaveBeenCalled();
  for (let i = 0; i < 10; i++) reveal(400, viewport, true, null);
  expect(scroll).toHaveBeenCalledTimes(1);
  reveal(0, viewport, false, null);
  reveal(400, viewport, true, null);
  expect(scroll).toHaveBeenCalledTimes(2);
});
it("keeps an already visible field stable and never changes focus", () => {
  const { field, scroll, viewport } = setup();
  vi.mocked(field.getBoundingClientRect).mockReturnValue({
    top: 50,
    bottom: 94,
  } as DOMRect);
  keyboardVisibility()(400, viewport, true, null);
  expect(scroll).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(field);
});
it("accounts for footer obstruction without changing its geometry", () => {
  const { field, scroll, viewport } = setup();
  vi.mocked(field.getBoundingClientRect).mockReturnValue({
    top: 250,
    bottom: 294,
  } as DOMRect);
  const footer = document.querySelector("footer");
  if (!footer) throw Error("fixture");
  vi.spyOn(footer, "getBoundingClientRect").mockReturnValue({
    top: 200,
  } as DOMRect);
  keyboardVisibility()(400, viewport, true, footer);
  expect(scroll).toHaveBeenCalledTimes(1);
});
