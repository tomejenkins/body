// A viewport scroll can be caused by scrollIntoView itself. Never recenter on
// those events, and reveal a focused field at most once per keyboard opening.
export function keyboardVisibility() {
  let revealed: Element | null = null;
  return (
    inset: number,
    viewport: VisualViewport | null,
    reveal: boolean,
    footer: HTMLElement | null,
  ) => {
    if (inset <= 150) {
      revealed = null;
      return;
    }
    if (!reveal || !viewport) return;
    const field = document.activeElement;
    if (
      !(field instanceof HTMLElement) ||
      !field.matches(".workout-execution input, .workout-execution select") ||
      field === revealed
    )
      return;
    revealed = field;
    const rect = field.getBoundingClientRect();
    const bottom = Math.min(
      viewport.offsetTop + viewport.height,
      footer?.getBoundingClientRect().top ?? Infinity,
    );
    if (rect.top < viewport.offsetTop || rect.bottom > bottom)
      field.scrollIntoView({ block: "center", behavior: "auto" });
  };
}
