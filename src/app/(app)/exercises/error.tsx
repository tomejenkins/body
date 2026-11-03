"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state">
      <h1>Your library couldn’t load.</h1>
      <p role="alert">Check your connection and sign-in, then retry.</p>
      <Button onClick={reset}>Try again</Button>
      <p>
        <Link href="/workout">Back to workout</Link>
      </p>
    </section>
  );
}
