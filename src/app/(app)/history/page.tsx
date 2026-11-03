import { SectionPlaceholder } from "@/components/section-placeholder";
export const metadata = { title: "History" };
export default function Page() {
  return (
    <SectionPlaceholder
      eyebrow={"SEE YOUR PROGRESS"}
      title={"Every effort adds up."}
      description={"A clear view of the work you put in."}
      emptyTitle={"A story worth building"}
      emptyDescription={
        "Completed workouts, performance trends, and personal records will appear here once tracking is available."
      }
    />
  );
}
