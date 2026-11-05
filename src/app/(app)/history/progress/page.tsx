import { requireUser } from "@/features/auth/session";
import { TrainingProgress } from "@/components/progress/training-progress";
export const metadata = { title: "Training progress" };
export default async function Page() {
  await requireUser("/history/progress");
  return <TrainingProgress />;
}
