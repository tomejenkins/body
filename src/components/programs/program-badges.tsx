import { programBadges, type CatalogCard } from "@/features/programs/catalog";
export function ProgramBadges({
  program,
  now,
}: {
  program: Pick<CatalogCard, "publishedAt" | "featured">;
  now: Date;
}) {
  return (
    <div className="program-badges">
      {programBadges(program, now).map((b) => (
        <span className="program-badge" key={b}>
          {b}
        </span>
      ))}
    </div>
  );
}
