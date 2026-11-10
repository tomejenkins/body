import Link from "next/link";
export function HistoryViewSelector({
  current,
}: {
  current: "workouts" | "programs";
}) {
  return (
    <nav
      className="history-filters history-view-selector"
      aria-label="History views"
    >
      <Link
        href="/history"
        aria-current={current === "workouts" ? "page" : undefined}
      >
        Workouts
      </Link>
      <Link
        href="/history/programs"
        aria-current={current === "programs" ? "page" : undefined}
      >
        Programs
      </Link>
    </nav>
  );
}
