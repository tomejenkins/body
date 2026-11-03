"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state">
      <h1>Your workout couldn’t load.</h1>
      <p role="alert">
        Your saved progress is still yours. Check your connection and sign-in,
        then retry.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
