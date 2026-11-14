"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { PageHeader } from "@/components/page-header";
import { ScoreBadge } from "@/components/score-badge";
import { toast, toastResult } from "@/components/toast";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { postedAgo } from "@/lib/job-search/search";
import type {
  RadarCompanyItem,
  RadarData,
  RadarEcosystemItem,
  RadarJobItem,
  RadarTab,
  RemotePolicyTier,
} from "@/lib/radar/types";

import {
  dismissStartupRole,
  scoreStartupRole,
  startApplicationFromRole,
} from "../startups/actions";

export function RadarScreen({ data }: { data: RadarData }) {
  const [tab, setTab] = useState<RadarTab>("roles");

  return (
    <>
      <PageHeader
        title="Radar"
        description="Market intelligence and real-time job detection: tracking 670+ open roles across French and European tech scaleups, verified remote policies, and hiring ecosystems."
      />

      <div className="flex flex-col gap-6 px-4 sm:px-6 md:px-10 pb-12 sm:pb-20">
        {/* Navigation Tabs */}
        <nav aria-label="Radar sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
          <button
            type="button"
            onClick={() => setTab("roles")}
            className={cn(
              "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === "roles" ? "bg-selected text-ink shadow-xs" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            <span>Live Roles</span>
            <span className="rounded-full bg-input px-2 py-0.5 text-xs text-muted">{data.jobs.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("policies")}
            className={cn(
              "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === "policies" ? "bg-selected text-ink shadow-xs" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            <span>Company Policies</span>
            <span className="rounded-full bg-input px-2 py-0.5 text-xs text-muted">{data.companies.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("ecosystem")}
            className={cn(
              "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === "ecosystem" ? "bg-selected text-ink shadow-xs" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            <span>Remote Ecosystems</span>
            <span className="rounded-full bg-input px-2 py-0.5 text-xs text-muted">{data.ecosystems.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("intelligence")}
            className={cn(
              "flex items-center gap-2 rounded-control px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === "intelligence" ? "bg-selected text-ink shadow-xs" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            <span>Market Intelligence</span>
          </button>
        </nav>

        {tab === "roles" && <LiveRolesTab jobs={data.jobs} today={data.today} />}
        {tab === "policies" && <CompanyPoliciesTab companies={data.companies} />}
        {tab === "ecosystem" && <EcosystemsTab ecosystems={data.ecosystems} />}
        {tab === "intelligence" && <IntelligenceTab data={data} />}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: LIVE ROLES RADAR
// ─────────────────────────────────────────────────────────────────────────────

function LiveRolesTab({ jobs, today }: { jobs: RadarJobItem[]; today: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filterRemote, setFilterRemote] = useState(false);
  const [filterFrance, setFilterFrance] = useState(false);
  const [filterScoredOnly, setFilterScoredOnly] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleJobs = useMemo(() => {
    const q = query.toLowerCase().trim();
    return jobs.filter((job) => {
      if (dismissed.has(job.externalId)) return false;
      if (filterRemote && job.remote !== true) return false;
      if (filterFrance && !/france|paris|lyon|bordeaux|nantes|lille/i.test(job.place)) return false;
      if (filterScoredOnly && job.score === null) return false;
      if (q) {
        const text = `${job.title} ${job.company} ${job.department} ${job.place}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, query, filterRemote, filterFrance, filterScoredOnly, dismissed]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search and filters bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 max-w-md">
          <Input
            type="search"
            placeholder="Search roles by title, tech or company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={filterRemote ? "primary" : "secondary"}
            onClick={() => setFilterRemote(!filterRemote)}
          >
            {filterRemote ? "✓ Remote Only" : "Remote Only"}
          </Button>
          <Button
            size="sm"
            variant={filterFrance ? "primary" : "secondary"}
            onClick={() => setFilterFrance(!filterFrance)}
          >
            {filterFrance ? "✓ In France" : "In France"}
          </Button>
          <Button
            size="sm"
            variant={filterScoredOnly ? "primary" : "secondary"}
            onClick={() => setFilterScoredOnly(!filterScoredOnly)}
          >
            {filterScoredOnly ? "✓ Scored Fits" : "Scored Fits"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-meta text-muted">
        <span>
          Showing {visibleJobs.length} of {jobs.length} tracked roles
        </span>
      </div>

      {/* Role list */}
      {visibleJobs.length === 0 ? (
        <div className="rounded-card border border-line bg-paper p-8 text-center text-muted">
          No open roles match your current search and filters.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleJobs.slice(0, 100).map((job) => (
            <RadarRoleCard
              key={job.externalId}
              job={job}
              today={today}
              onDismiss={() => setDismissed((prev) => new Set([...prev, job.externalId]))}
              onApply={() => router.push(`/new?posting=${encodeURIComponent(`STARTUPS:${job.externalId}`)}`)}
            />
          ))}
          {visibleJobs.length > 100 && (
            <p className="py-4 text-center text-meta text-muted">
              Displaying the top 100 roles matching your filter. Use the search box above to narrow down specific titles.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RadarRoleCard({
  job,
  today,
  onDismiss,
  onApply,
}: {
  job: RadarJobItem;
  today: string;
  onDismiss: () => void;
  onApply: () => void;
}) {
  const router = useRouter();
  const [starting, startTransition] = useTransition();
  const [scoreState, setScoreState] = useState<{ score: number | null; busy: boolean }>({
    score: job.score,
    busy: false,
  });

  const startApp = () =>
    startTransition(async () => {
      const res = toastResult(await startApplicationFromRole({ externalId: job.externalId }));
      if (res.ok) router.push(`/new?posting=${encodeURIComponent(res.data.postingId)}`);
    });

  const requestScore = async () => {
    setScoreState((prev) => ({ ...prev, busy: true }));
    try {
      const res = toastResult(await scoreStartupRole({ externalId: job.externalId }));
      if (!res.ok) {
        setScoreState((prev) => ({ ...prev, busy: false }));
        return;
      }
      toast("Scoring role against your profile…");
    } catch {
      setScoreState((prev) => ({ ...prev, busy: false }));
    }
  };

  const dismiss = async () => {
    onDismiss();
    toastResult(await dismissStartupRole({ externalId: job.externalId }));
  };

  return (
    <article className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-card border border-line-field bg-paper p-4 transition-shadow hover:shadow-xs">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {scoreState.score !== null ? (
            <ScoreBadge score={scoreState.score} size="sm" />
          ) : job.relevance > 0 ? (
            <span
              className="rounded-full bg-input border border-line px-2 py-0.5 text-xs font-mono text-muted"
              title="Calculated profile relevance score"
            >
              fit {job.relevance}
            </span>
          ) : null}
          <h3 className="font-medium text-base text-ink hover:underline">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              {job.title}
            </a>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
          <span className="font-medium text-ink">{job.company}</span>
          <span>·</span>
          <span>{job.place || "Remote"}</span>
          {job.remote && (
            <>
              <span>·</span>
              <span className="text-primary font-medium">Remote</span>
            </>
          )}
          {job.boardName && (
            <>
              <span>·</span>
              <span className="text-xs">via {job.boardName}</span>
            </>
          )}
          {job.postedAt && (
            <>
              <span>·</span>
              <span>{postedAgo(job.postedAt, new Date(today))}</span>
            </>
          )}
        </div>

        {job.scoreReasons.length > 0 && (
          <p className="text-xs text-muted line-clamp-1">
            {job.scoreReasons.join(" · ")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {job.applicationId ? (
          <Link href={`/applications/${job.applicationId}`} className={buttonClassName("secondary", "sm")}>
            Open application
          </Link>
        ) : (
          <Button size="sm" variant="primary" aria-disabled={starting || undefined} onClick={startApp}>
            {starting ? "Starting…" : "Start application"}
          </Button>
        )}

        {scoreState.score === null && (
          <Button size="sm" variant="secondary" aria-disabled={scoreState.busy || undefined} onClick={requestScore}>
            {scoreState.busy ? "Scoring…" : "Score"}
          </Button>
        )}

        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName("text", "sm")}
        >
          Apply on board ↗
        </a>

        <Button size="sm" variant="text" onClick={dismiss} title="Dismiss this role">
          Not for me
        </Button>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: COMPANY REMOTE POLICIES
// ─────────────────────────────────────────────────────────────────────────────

function CompanyPoliciesTab({ companies }: { companies: RadarCompanyItem[] }) {
  const [filterTier, setFilterTier] = useState<RemotePolicyTier | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return companies.filter((c) => {
      if (filterTier !== "ALL" && c.policyTier !== filterTier) return false;
      if (s && !`${c.name} ${c.location} ${c.keyRoles.join(" ")}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [companies, filterTier, search]);

  const counts = useMemo(() => {
    return {
      all: companies.length,
      fullRemote: companies.filter((c) => c.policyTier === "FULLY_REMOTE").length,
      remoteFrance: companies.filter((c) => c.policyTier === "REMOTE_FRANCE").length,
      hybrid: companies.filter((c) => c.policyTier === "HYBRID").length,
    };
  }, [companies]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 max-w-md">
          <Input
            type="search"
            placeholder="Search company or tech stack…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={filterTier === "ALL" ? "primary" : "secondary"}
            onClick={() => setFilterTier("ALL")}
          >
            All ({counts.all})
          </Button>
          <Button
            size="sm"
            variant={filterTier === "FULLY_REMOTE" ? "primary" : "secondary"}
            onClick={() => setFilterTier("FULLY_REMOTE")}
          >
            🟢 Fully Remote ({counts.fullRemote})
          </Button>
          <Button
            size="sm"
            variant={filterTier === "REMOTE_FRANCE" ? "primary" : "secondary"}
            onClick={() => setFilterTier("REMOTE_FRANCE")}
          >
            🔵 Remote in France ({counts.remoteFrance})
          </Button>
          <Button
            size="sm"
            variant={filterTier === "HYBRID" ? "primary" : "secondary"}
            onClick={() => setFilterTier("HYBRID")}
          >
            🟡 Hybrid / Selective ({counts.hybrid})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <article
            key={c.id}
            className="flex flex-col gap-3 rounded-card border border-line-field bg-paper p-5 transition-shadow hover:shadow-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg font-medium text-ink">{c.name}</h3>
                <p className="text-meta text-muted">{c.location}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                  c.policyTier === "FULLY_REMOTE"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : c.policyTier === "REMOTE_FRANCE"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
                )}
              >
                {c.policyLabel}
              </span>
            </div>

            <p className="text-xs text-muted text-pretty">{c.policyDescription}</p>

            {c.keyRoles.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.keyRoles.map((role) => (
                  <span key={role} className="rounded-md bg-input px-2 py-0.5 text-xs text-muted">
                    {role}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-line flex items-center justify-between text-xs">
              <span className="font-medium text-ink">
                {c.jobCount > 0 ? (
                  <span className="text-primary font-semibold">{c.jobCount} open roles</span>
                ) : (
                  <span className="text-muted">No roles on board</span>
                )}
                {c.boardName && <span className="text-muted font-normal"> · {c.boardName}</span>}
              </span>
              <div className="flex items-center gap-2">
                {c.boardUrl ? (
                  <a
                    href={c.boardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    View ATS ↗
                  </a>
                ) : (
                  <a
                    href={c.careersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink hover:underline"
                  >
                    Careers ↗
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: ECOSYSTEM & JOB BOARDS RADAR
// ─────────────────────────────────────────────────────────────────────────────

function EcosystemsTab({ ecosystems }: { ecosystems: RadarEcosystemItem[] }) {
  const [keyword, setKeyword] = useState("AI Engineer");
  const franceList = ecosystems.filter((e) => e.region === "France");
  const europeList = ecosystems.filter((e) => e.region === "Europe & Global");

  return (
    <div className="flex flex-col gap-6">
      {/* Quick query launcher */}
      <div className="rounded-card border border-line-field bg-paper p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-medium text-base text-ink">Ecosystem Direct Launcher</h3>
          <p className="text-meta text-muted">
            Enter target keywords to open live job directories pre-filtered for your search.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search keyword (e.g. AI Engineer, Python)"
            className="w-64"
          />
        </div>
      </div>

      {/* France Remote Engines */}
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg font-medium text-ink">France Remote Search Engines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {franceList.map((item) => (
            <EcosystemCard key={item.name} item={item} keyword={keyword} />
          ))}
        </div>
      </section>

      {/* Europe & Global Remote */}
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg font-medium text-ink">European & Global Remote Directories</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {europeList.map((item) => (
            <EcosystemCard key={item.name} item={item} keyword={keyword} />
          ))}
        </div>
      </section>
    </div>
  );
}

function EcosystemCard({ item, keyword }: { item: RadarEcosystemItem; keyword: string }) {
  const targetUrl = item.searchUrl && keyword.trim() ? `${item.searchUrl}${encodeURIComponent(keyword.trim())}` : item.url;

  return (
    <article className="flex flex-col justify-between gap-3 rounded-card border border-line-field bg-paper p-4 transition-shadow hover:shadow-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-base text-ink">{item.name}</h4>
          <span className="rounded-full bg-input px-2 py-0.5 text-xs font-mono text-muted whitespace-nowrap">
            {item.tag}
          </span>
        </div>
        <p className="text-xs text-muted text-pretty">{item.description}</p>
      </div>

      <div className="pt-2 border-t border-line flex items-center justify-between">
        <span className="text-xs text-muted">{item.region}</span>
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
        >
          <span>Open Directory</span>
          <span>↗</span>
        </a>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: MARKET INTELLIGENCE STATS
// ─────────────────────────────────────────────────────────────────────────────

function IntelligenceTab({ data }: { data: RadarData }) {
  const { stats } = data;
  const remotePct = stats.totalRoles > 0 ? Math.round((stats.remoteRoles / stats.totalRoles) * 100) : 0;
  const francePct = stats.totalRoles > 0 ? Math.round((stats.franceRoles / stats.totalRoles) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-card border border-line-field bg-paper p-5">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Tracked Roles</div>
          <div className="font-serif text-3xl font-semibold text-ink mt-2">{stats.totalRoles}</div>
          <div className="text-xs text-muted mt-1">Live open postings detected</div>
        </div>

        <div className="rounded-card border border-line-field bg-paper p-5">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Remote Share</div>
          <div className="font-serif text-3xl font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
            {remotePct}%
          </div>
          <div className="text-xs text-muted mt-1">{stats.remoteRoles} fully remote roles</div>
        </div>

        <div className="rounded-card border border-line-field bg-paper p-5">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Monitored Scaleups</div>
          <div className="font-serif text-3xl font-semibold text-ink mt-2">{stats.totalCompanies}</div>
          <div className="text-xs text-muted mt-1">{stats.activeBoards} active ATS feeds</div>
        </div>

        <div className="rounded-card border border-line-field bg-paper p-5">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">France Coverage</div>
          <div className="font-serif text-3xl font-semibold text-blue-600 dark:text-blue-400 mt-2">
            {francePct}%
          </div>
          <div className="text-xs text-muted mt-1">{stats.franceRoles} roles located in France</div>
        </div>
      </div>

      {/* Top Hiring Companies Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-card border border-line-field bg-paper p-5 flex flex-col gap-4">
          <h3 className="font-serif text-lg font-medium text-ink">Most Active Hiring Scaleups</h3>
          <p className="text-xs text-muted">
            Tech companies with the highest number of open positions in their ATS feeds.
          </p>
          <div className="flex flex-col gap-2.5">
            {stats.topHiringCompanies.map((c) => {
              const maxCount = stats.topHiringCompanies[0]?.count || 1;
              const widthPct = Math.max(12, Math.round((c.count / maxCount) * 100));
              return (
                <div key={c.company} className="flex items-center gap-3 text-sm">
                  <span className="w-36 font-medium text-ink truncate">{c.company}</span>
                  <div className="flex-1 bg-input rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-muted w-12 text-right">{c.count} roles</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-card border border-line-field bg-paper p-5 flex flex-col gap-4">
          <h3 className="font-serif text-lg font-medium text-ink">Remote Policy Breakdown</h3>
          <p className="text-xs text-muted">
            Distribution of the 110+ verified French and European tech companies tracked on Dossier.
          </p>
          <div className="flex flex-col gap-3 my-auto">
            <div className="flex items-center justify-between p-3 rounded-control border border-line bg-card">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-emerald-500" />
                <span className="font-medium text-sm text-ink">Fully Remote / Remote-First</span>
              </div>
              <span className="text-xs font-mono text-muted">45+ Companies</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-control border border-line bg-card">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-blue-500" />
                <span className="font-medium text-sm text-ink">Remote Within France / EU</span>
              </div>
              <span className="text-xs font-mono text-muted">20+ Scale-ups</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-control border border-line bg-card">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-amber-500" />
                <span className="font-medium text-sm text-ink">Hybrid / Selective Exceptions</span>
              </div>
              <span className="text-xs font-mono text-muted">15+ Companies</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
