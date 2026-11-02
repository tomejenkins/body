import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Dumbbell,
  CalendarDays,
  ChartNoAxesCombined,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Dashboard" };
const destinations = [
  {
    href: "/programs",
    icon: CalendarDays,
    number: "01",
    title: "Find your rhythm",
    description: "A plan that meets you where you are.",
    label: "Explore programs",
  },
  {
    href: "/history",
    icon: ChartNoAxesCombined,
    number: "02",
    title: "See the bigger picture",
    description: "Small efforts. Meaningful progress.",
    label: "View your history",
  },
];
export default function Dashboard() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR DAILY FOUNDATION</p>
        <h1>Show up for yourself.</h1>
        <p className="intro">
          Less friction. More focus. A little progress, every day.
        </p>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge">
            <span className="status-dot" /> BUILT FOR YOUR NEXT CHAPTER
          </span>
          <h2>
            Good things
            <br />
            start with
            <br />
            <span>one rep.</span>
          </h2>
          <p>
            Your training deserves a space that feels as intentional as the
            effort you put in.
          </p>
          <Button asChild>
            <Link href="/workout">
              Explore your workout space{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Button>
          <span className="hero-note">
            Your journey starts here. Logging is coming soon.
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="art-center">
            <Dumbbell size={64} strokeWidth={1.2} />
          </div>
          <span className="art-label">CONSISTENCY OVER EVERYTHING</span>
        </div>
      </section>
      <div className="section-title">
        <h2>A little intention goes a long way.</h2>
        <span>YOUR TOOLKIT</span>
      </div>
      <div className="toolkit">
        {destinations.map((item) => (
          <Link className="tool-card" href={item.href} key={item.href}>
            <div className="tool-top">
              <item.icon size={24} strokeWidth={1.5} aria-hidden="true" />
              <span>{item.number}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <div className="tool-link">
              {item.label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
      <div className="quiet-note">
        <span className="status-dot" />
        <p>
          Just you and your progress.{" "}
          <span>
            Your training is personal. Sharing will always be your choice.
          </span>
        </p>
      </div>
    </>
  );
}
