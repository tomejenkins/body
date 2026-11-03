import { SectionPlaceholder } from "@/components/section-placeholder";
export const metadata = { title: "Workout" };
export default function Page() {
  return (
    <SectionPlaceholder
      eyebrow={"TRAIN WITH INTENTION"}
      title={"Your next rep starts here."}
      description={"A quieter way to focus on the work in front of you."}
      emptyTitle={"Room for your next workout"}
      emptyDescription={
        "Workout logging is being built. Your exercises, sets, and rest will have a home here."
      }
    />
  );
}
