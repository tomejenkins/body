import { SectionPlaceholder } from "@/components/section-placeholder";
export const metadata = { title: "Programs" };
export default function Page() {
  return (
    <SectionPlaceholder
      eyebrow={"MAKE A PLAN"}
      title={"Structure for your ambition."}
      description={"A training rhythm that fits your life."}
      emptyTitle={"Your path, personalized"}
      emptyDescription={
        "Your programs will live here. Personalized plans and movement recommendations are coming later."
      }
    />
  );
}
