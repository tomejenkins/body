import Link from "next/link";
import { sameEnrollmentVersion } from "@/features/programs/enrollment-model";
import { notFound } from "next/navigation";
import {
  loadEnrollmentContext,
  loadEnrollmentVersion,
} from "@/features/programs/enrollment-queries";
import { LifecycleForm } from "@/components/programs/lifecycle-form";
import { localDate } from "@/features/scheduling/model";
export const metadata = { title: "Start or switch program" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const params = await searchParams,
    [v, c] = await Promise.all([
      loadEnrollmentVersion(params.version),
      loadEnrollmentContext(),
    ]);
  if (!v) notFound();
  const same = sameEnrollmentVersion(c.enrollment, v.id);
  return (
    <section className="enrollment-surface">
      <Link href="/programs">← Programs</Link>
      <h1>
        {same
          ? "Your current program"
          : c.enrollment
            ? "Switch Program"
            : "Start Program"}
      </h1>
      <h2>{v.definition.program.name}</h2>
      {same ? (
        <Link href="/programs/current">Continue Current Program</Link>
      ) : (
        <>
          {c.enrollment && (
            <p>
              Switching from <strong>{c.enrollment.name}</strong> to{" "}
              <strong>{v.definition.program.name}</strong> ends your current
              program. Your historical workouts and progress will be preserved.
            </p>
          )}
          {c.activeSession && (
            <p role="status">
              Finish or abandon your active workout first.{" "}
              <Link href={`/workout/${c.activeSession}`}>Resume Workout</Link>
            </p>
          )}
          <LifecycleForm
            kind={c.enrollment ? "switch" : "start"}
            assignment={c.enrollment?.id}
            revision={c.enrollment?.lifecycleRevision ?? 0}
            version={v.id}
            request={crypto.randomUUID()}
            label={c.enrollment ? "Switch Program" : "Start Program"}
            timezone={c.timezone}
            fallbackDate={localDate(c.timezone ?? "UTC")}
            blocked={!!c.activeSession}
          />
        </>
      )}
    </section>
  );
}
