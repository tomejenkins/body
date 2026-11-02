"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Dumbbell,
  LayoutGrid,
  CalendarDays,
  ChartNoAxesCombined,
  Users,
  UserRound,
} from "lucide-react";
import { navigation } from "@/config/navigation";
import { cn } from "@/lib/utils";
const icons = {
  dashboard: LayoutGrid,
  workout: Dumbbell,
  programs: CalendarDays,
  history: ChartNoAxesCombined,
  feed: Users,
  profile: UserRound,
};
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Link href="/dashboard" className="brand" aria-label="Body home">
          <Activity aria-hidden="true" size={27} /> body
          <span className="brand-dot">.</span>
        </Link>
        <p className="nav-caption">YOUR TRAINING SPACE</p>
        <nav aria-label="Main navigation" className="navigation">
          {navigation.map((item) => {
            const Icon = icons[item.icon];
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("nav-link", active && "active")}
              >
                <Icon aria-hidden="true" size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" /> A little stronger, every day.
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <Link href="/dashboard" className="mobile-brand">
            body.
          </Link>
          <span className="topbar-label">A SPACE TO BUILD YOURSELF</span>
          <span className="private-label">
            <span className="status-dot" /> Private by design
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="page-footer">
          BUILT AROUND YOU. ONE REP AT A TIME.
        </footer>
      </div>
    </>
  );
}
