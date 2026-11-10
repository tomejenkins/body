import Link from "next/link";
import { sameEnrollmentVersion } from "@/features/programs/enrollment-model";
import { loadEnrollmentContext } from "@/features/programs/enrollment-queries";
import { EnrollmentSummary } from "./enrollment-summary";
export async function CurrentProgram() {
  const c = await loadEnrollmentContext();
  return c.enrollment ? (
    <>
      <EnrollmentSummary enrollment={c.enrollment} unit={c.unit} current />
      {c.activeSession && (
        <p>
          <Link href={`/workout/${c.activeSession}`}>Resume Workout</Link>
        </p>
      )}
    </>
  ) : null;
}
export async function ProgramEnrollmentEntry({ version }: { version: string }) {
  const { enrollment: a } = await loadEnrollmentContext(),
    same = sameEnrollmentVersion(a, version);
  return (
    <Link
      className="program-enrollment-entry"
      href={same ? "/programs/current" : `/programs/enroll?version=${version}`}
    >
      {same
        ? "Continue Current Program"
        : a
          ? "Switch to This Program"
          : "Start Program"}
    </Link>
  );
}
