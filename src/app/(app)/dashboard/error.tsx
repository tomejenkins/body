"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state">
      <h1>Your Dashboard couldn’t load.</h1>
      <p role="alert">Check your connection and sign-in, then retry.</p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
