import { ArrowUpRight, CircleDashed } from "lucide-react";
export function SectionPlaceholder({
  eyebrow,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="intro">{description}</p>
      </div>
      <section className="empty-state" aria-label={emptyTitle}>
        <span className="empty-icon">
          <CircleDashed aria-hidden="true" size={32} />
        </span>
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
        <span className="coming-label">
          COMING INTO FOCUS <ArrowUpRight aria-hidden="true" size={14} />
        </span>
      </section>
    </>
  );
}
