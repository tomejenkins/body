import { ManagementPanel } from "@/components/ui/management-panel";
import Link from "next/link";
import { loadEnrollmentContext } from "@/features/programs/enrollment-queries";
import { EnrollmentSummary } from "@/components/programs/enrollment-summary";
import { LifecycleForm } from "@/components/programs/lifecycle-form";
import { ProgramCalendar } from "@/components/programs/program-calendar";
export const metadata = { title: "Current program" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ manage?: string }>;
}) {
  const params = await searchParams;
  const c = await loadEnrollmentContext(),
    a = c.enrollment;
  if (!a)
    return (
      <section className="enrollment-surface refined-screen">
        <h1>Current Program</h1>
        <p>No active program.</p>
        <Link href="/programs">Browse Programs</Link>
        <Link href="/history/programs">Program History</Link>
      </section>
    );
  return (
    <section className="enrollment-surface refined-screen">
      <Link href="/programs">← Programs</Link>
      <h1>Current Program</h1>
      <EnrollmentSummary enrollment={a} unit={c.unit} />
      <div className="enrollment-links">
        {c.activeSession ? (
          <Link href={`/workout/${c.activeSession}`}>Resume Workout</Link>
        ) : (
          <Link href="/workout">Continue / View Workout</Link>
        )}
        <Link href={`/history/programs/${a.id}`}>View Program History</Link>
      </div>
      {a.status === "Completed" && (
        <p>
          Your prescribed program is complete. End this enrollment before
          deliberately starting it again.
        </p>
      )}
      <div className="program-management" id="manage-program">
        <ManagementPanel
          label="Manage Program"
          initialOpen={params.manage === "1"}
        >
          <Link href="/programs?switch=1#program-library-results">
            Switch Program
          </Link>
          {c.activeSession && (
            <p>
              Finish or abandon your active workout before ending or switching.{" "}
              <Link href={`/workout/${c.activeSession}`}>
                Return to active workout
              </Link>
            </p>
          )}
          {a.pendingEnd ? (
            <>
              <LifecycleForm
                kind="cancel_end"
                assignment={a.id}
                revision={a.lifecycleRevision}
                request={crypto.randomUUID()}
                label="Cancel Scheduled End"
              />
            </>
          ) : (
            a.status !== "Completed" && (
              <LifecycleForm
                kind="end_after_next"
                assignment={a.id}
                revision={a.lifecycleRevision}
                request={crypto.randomUUID()}
                label="End After Next Workout"
              />
            )
          )}
          <LifecycleForm
            kind="end_now"
            assignment={a.id}
            revision={a.lifecycleRevision}
            request={crypto.randomUUID()}
            label="End Program Now"
            blocked={!!c.activeSession}
          />
        </ManagementPanel>
      </div>
      <ProgramCalendar />
    </section>
  );
}
