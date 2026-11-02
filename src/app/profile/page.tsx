import { SectionPlaceholder } from "@/components/section-placeholder";
export const metadata = { title: "Profile" };
export default function Page() {
  return (
    <SectionPlaceholder
      eyebrow={"MAKE IT YOURS"}
      title={"Your space. Your pace."}
      description={"The foundation for a more personal training experience."}
      emptyTitle={"A place for your preferences"}
      emptyDescription={
        "Account and training preferences are coming later. Authentication is not connected yet."
      }
    />
  );
}
