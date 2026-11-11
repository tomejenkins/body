// Native Details closure can leave focus inside hidden content. Only move the
// focus that this closure would hide; never steal focus from another row.
export function collapseSetOptions(panel: HTMLDetailsElement) {
  const summary = panel.querySelector<HTMLElement>(":scope > summary");
  const focused = panel.ownerDocument.activeElement;
  const hidesFocus = focused !== summary && panel.contains(focused);
  panel.open = false;
  if (hidesFocus) summary?.focus({ preventScroll: true });
}
