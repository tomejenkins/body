import {
  activities,
  cardioMinutes,
  cardioTotals,
  type CardioItem,
} from "@/features/cardio/model";
export function CardioSummary({ items = [] }: { items?: CardioItem[] }) {
  if (!items.length) return null;
  const total = cardioTotals(items);
  return (
    <section className="cardio-history" aria-label="Manual cardio">
      <h2>Cardio</h2>
      <p>
        {cardioMinutes(total.seconds)} recorded · {total.completed}{" "}
        {total.completed === 1 ? "activity" : "activities"}
      </p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <strong>{activities[i.activity]}</strong>
            <span>
              {i.durationSeconds === null
                ? "Not completed"
                : cardioMinutes(i.durationSeconds)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
