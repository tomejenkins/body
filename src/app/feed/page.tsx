import { SectionPlaceholder } from "@/components/section-placeholder";
export const metadata = { title: "Feed" };
export default function Page() {
  return (
    <SectionPlaceholder
      eyebrow={"YOUR INNER CIRCLE"}
      title={"Progress is personal."}
      description={"Choose what you share, and who you share it with."}
      emptyTitle={"Connection on your terms"}
      emptyDescription={
        "Social features are coming later. Sharing will be private by default and always your choice."
      }
    />
  );
}
