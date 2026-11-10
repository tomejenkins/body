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
    <div className="program-library">
      <header className="library-heading">
        <p className="eyebrow">A rhythm that fits</p>
        <h1>Programs</h1>
        <p>
          Original Body training plans. Explore the structure, find your
          starting point.
        </p>
      </header>
      <CurrentProgram />
      <ProgramCalendar week={params.week} baseHref={catalogURL(f)} />
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
        <label>
          Search programs
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            maxLength={100}
            placeholder="Find a program"
          />
        </label>
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
        <div className="program-filter-actions">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="outline">
            <Link href="/programs">Reset filters</Link>
          </Button>
        </div>
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
      <p className="muted">
        Start a program workout from its details, then choose exercises as you
        train. Your current workout stays unchanged while browsing.
      </p>
    </div>
  );
}
