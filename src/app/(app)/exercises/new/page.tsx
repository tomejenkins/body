import { loadLibrary } from "@/features/exercises/queries";
import { ExerciseEditor } from "@/components/exercises/exercise-editor";
export const metadata = { title: "Create exercise" };
export default async function Page() {
  const library = await loadLibrary();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR WAY TO MOVE</p>
        <h1>Create an exercise.</h1>
        <p className="intro">Keep your own movements, privately.</p>
      </div>
      <ExerciseEditor library={library} />
    </>
  );
}
