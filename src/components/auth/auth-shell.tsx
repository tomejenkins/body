import Link from "next/link";
import { Activity } from "lucide-react";
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-page">
      <a href="#auth-main" className="skip-link">
        Skip to content
      </a>
      <header className="auth-brand">
        <Link href="/" aria-label="Body home">
          <Activity aria-hidden="true" size={27} /> body.
        </Link>
        <span>YOUR TRAINING SPACE</span>
      </header>
      <main id="auth-main" tabIndex={-1} className="auth-card">
        <p className="eyebrow">A LITTLE STRONGER, EVERY DAY</p>
        <h1>{title}</h1>
        <p className="intro">{description}</p>
        {children}
      </main>
      <footer className="auth-footer">
        Your progress is personal. Your account stays yours.
      </footer>
    </div>
  );
}
