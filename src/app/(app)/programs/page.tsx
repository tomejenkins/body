import { Search } from "lucide-react";
import { ProgramCalendar } from "@/components/programs/program-calendar";
import { CurrentProgram } from "@/components/programs/current-program";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  catalogFacets,
  catalogFilters,
  catalogURL,
  experienceLabel,
  frequencyLabel,
  goalLabel,
  type CatalogFacet,
} from "@/features/programs/catalog";
import { loadProgramCatalog } from "@/features/programs/library-queries";
import { ProgramCover } from "@/components/programs/program-cover";
import { ProgramBadges } from "@/components/programs/program-badges";
export const metadata = { title: "Programs" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const f = catalogFilters(params),
    catalog = await loadProgramCatalog(f),
    now = new Date();
  return (
    <div className="program-library refined-screen">
      <header className="library-heading">
        <h1>Programs</h1>
        <p>Find your training rhythm.</p>
      </header>
      <CurrentProgram />
      <Link className="program-schedule-link" href="#program-calendar">
        View Schedule →
      </Link>
      {params.switch === "1" && (
        <p role="status">
          Choose a replacement program. Your existing history will be preserved.
        </p>
      )}
      <form
        key={catalogURL(f)}
        method="get"
        action="/programs"
        className="program-filters"
        aria-label="Program filters"
      >
        <div className="program-search-row">
          <label>
            <span className="sr-only">Search programs</span>
            <input
              type="search"
              name="q"
              defaultValue={f.q}
              maxLength={100}
              placeholder="Find a program"
            />
          </label>
          <Button
            type="submit"
            aria-label="Apply filters"
            title="Apply filters"
          >
            <Search size={20} aria-hidden="true" />
          </Button>
        </div>
        <details
          open={Object.keys(catalogFacets).some((k) => !!f[k as CatalogFacet])}
        >
          <summary>Filter programs</summary>
          <div className="program-filter-grid">
            {(Object.keys(catalogFacets) as CatalogFacet[]).map((key) => (
              <label key={key}>
                {key === "frequency"
                  ? "Training frequency"
                  : key[0].toUpperCase() + key.slice(1)}
                <select name={key} defaultValue={f[key]}>
                  <option value="">All</option>
                  {Object.entries(catalogFacets[key]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
        <Link className="program-reset" href="/programs">
          Reset filters
        </Link>
      </form>
      <p role="status">
        {catalog.total} {catalog.total === 1 ? "program" : "programs"} found
      </p>
      {catalog.items.length ? (
        <div className="program-card-grid" id="program-library-results">
          {catalog.items.map((p) => (
            <article className="program-card" key={p.id}>
              <Link href={`/programs/${p.id}`} aria-label={`View ${p.name}`}>
                <ProgramCover media={p.cover} title={p.name} />
              </Link>
              <div className="program-card-body">
                <ProgramBadges program={p} now={now} />
                <h2>
                  <Link href={`/programs/${p.id}`}>{p.name}</Link>
                </h2>
                <p>{p.summary}</p>
                <p className="program-meta">
                  {goalLabel(p.objective)} · {experienceLabel(p.experience)}
                </p>
                <p className="program-meta">
                  {frequencyLabel(p)} · Flexible rotation
                </p>
                <div className="program-tags">
                  {p.tags
                    .filter((t) => t.category !== "style")
                    .slice(0, 3)
                    .map((t) => (
                      <span key={t.slug}>{t.name}</span>
                    ))}
                </div>
                <Link className="program-view-link" href={`/programs/${p.id}`}>
                  View Program <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No programs match yet</h2>
          <p>Try fewer filters or a different search.</p>
          <Link href="/programs">Reset filters</Link>
        </div>
      )}
      <nav aria-label="Program pages" className="program-pagination">
        {f.page > 1 && (
          <Button asChild variant="outline">
            <Link href={catalogURL(f, f.page - 1)}>Previous page</Link>
          </Button>
        )}
        <span>
          Page {f.page} of {Math.max(1, Math.ceil(catalog.total / 6))}
        </span>
        {f.page * 6 < catalog.total && (
          <Button asChild variant="outline">
            <Link href={catalogURL(f, f.page + 1)}>Next page</Link>
          </Button>
        )}
      </nav>
      <ProgramCalendar week={params.week} baseHref={catalogURL(f)} />
      <p className="muted">
        Browsing keeps your current program and workout unchanged.
      </p>
    </div>
  );
}
