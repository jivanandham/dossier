import "server-only";

import { StartupStatus } from "@/generated/prisma/enums";
import { postingStates } from "@/lib/postings";
import { prisma } from "@/lib/prisma";
import { ATS_NAMES, parseBoardKey } from "@/lib/startups/ats";
import { boardUrl } from "@/lib/startups/jobs";

import type {
  RadarCompanyItem,
  RadarData,
  RadarEcosystemItem,
  RadarJobItem,
  RadarStats,
  RemotePolicyTier,
} from "./types";

const FULL_REMOTE_COMPANIES = new Set([
  "strapi", "phantombuster", "boondmanager", "scalingo", "doist", "toggl",
  "camunda", "storyblok", "n8n", "gitlab", "canonical", "remote.com",
  "oyster hr", "automattic", "slite", "folk", "serpapi", "simple analytics",
  "distru", "3ive", "mixrank", "sortrace", "opsfleet", "albert",
  "kaveronix", "odette technologies", "memorang", "raids ai", "proofline",
  "blockrotate", "collabify", "aethergrid", "tether", "eggai", "baserow",
  "virtusan", "eventfirst", "ksc trading", "bubblehouse", "cocient", "fly.io",
  "duckduckgo", "supabase", "hotjar (contentsquare)", "netbird",
]);

const REMOTE_FRANCE_COMPANIES = new Set([
  "alan", "pennylane", "qonto", "pleo", "blablacar", "gitguardian", "skello",
  "indy", "voyage privé", "forest admin", "360learning", "aircall", "dataiku",
  "elastic", "obat", "gitbook",
]);

function policyOf(company: string, summary: string, details: string, remote: boolean): { tier: RemotePolicyTier; label: string; description: string } {
  const norm = company.toLowerCase().trim();
  if (FULL_REMOTE_COMPANIES.has(norm) || /100%\s*remote|fully remote|all-remote|remote-first/i.test(`${summary} ${details}`)) {
    return {
      tier: "FULLY_REMOTE",
      label: "Fully Remote / Remote-First",
      description: "Distributed-first culture with hires across France, Europe or worldwide.",
    };
  }
  if (REMOTE_FRANCE_COMPANIES.has(norm) || /remote france|remote eu|anywhere in france/i.test(`${summary} ${details}`) || remote) {
    return {
      tier: "REMOTE_FRANCE",
      label: "Remote Within France / EU",
      description: "Formal full-remote contracts permitted within France or specified European countries.",
    };
  }
  return {
    tier: "HYBRID",
    label: "Hybrid / Office-First",
    description: "Hub or office-first policy with selective remote exceptions or hybrid flexibility.",
  };
}

export const RADAR_ECOSYSTEMS: RadarEcosystemItem[] = [
  // France Remote
  {
    name: "Welcome to the Jungle (Télétravail total)",
    region: "France",
    url: "https://www.welcometothejungle.com/fr/jobs?refinementList%5Bworkplace%5D%5B%5D=full_remote",
    searchUrl: "https://www.welcometothejungle.com/fr/jobs?refinementList%5Bworkplace%5D%5B%5D=full_remote&query=",
    tag: "Scale-ups & Tech",
    description: "Official filter for 100% full-remote CDI and tech roles across top French companies.",
  },
  {
    name: "Let me Start",
    region: "France",
    url: "https://letmestart.fr/offres/lieu/remote",
    tag: "340+ Remote FR",
    description: "Curated French startup job offers with guaranteed remote policies.",
  },
  {
    name: "RemoteFR",
    region: "France",
    url: "https://remotefr.com/",
    tag: "French Remote Hub",
    description: "Dedicated directory of French companies hiring remotely and remote job offers.",
  },
  {
    name: "Licorne Society Full Remote",
    region: "France",
    url: "https://www.licornesociety.com/startup-lists/startup-scale-up-next40-ft120",
    tag: "Next40 / FT120",
    description: "High-growth scaleups and French Tech unicorn ecosystems offering full remote positions.",
  },
  {
    name: "Station F Jobs",
    region: "France",
    url: "https://jobs.stationf.co/",
    tag: "Startup Campus",
    description: "Hiring boards from 1,000+ startups born at the world's largest startup campus in Paris.",
  },
  {
    name: "Malt (Tech Freelance)",
    region: "France",
    url: "https://www.malt.fr/",
    tag: "Freelance & Mission",
    description: "Leading European marketplace for software, AI, and data freelance engineering.",
  },
  {
    name: "Free-Work",
    region: "France",
    url: "https://www.free-work.com/fr",
    tag: "Contract / CDI",
    description: "France's largest IT community for remote tech contracts and permanent jobs.",
  },
  // Europe & Global Remote
  {
    name: "EU Remote Jobs",
    region: "Europe & Global",
    url: "https://euremotejobs.com/",
    tag: "Pan-European",
    description: "Hand-picked remote tech roles open specifically to residents across Europe.",
  },
  {
    name: "European Remote",
    region: "Europe & Global",
    url: "https://europeanremote.com/",
    tag: "220+ Verified Firms",
    description: "Comprehensive directory of 220+ tech firms that hire across European time zones.",
  },
  {
    name: "Remote Work Europe",
    region: "Europe & Global",
    url: "https://remoteworkeurope.eu/",
    tag: "EU Legal & Jobs",
    description: "Network of borderless European remote opportunities, guides, and cross-border tech hubs.",
  },
  {
    name: "Wellfound Remote",
    region: "Europe & Global",
    url: "https://wellfound.com/startups/location/france",
    tag: "AngelList Startups",
    description: "Global startup database with direct founder access and remote equity-funded roles.",
  },
  {
    name: "Remote OK (Europe)",
    region: "Europe & Global",
    url: "https://remoteok.com/remote-europe-jobs",
    tag: "Real-time Aggregator",
    description: "Live listings from remote-first tech companies hiring developers in Europe.",
  },
  {
    name: "Himalayas Europe",
    region: "Europe & Global",
    url: "https://himalayas.app/jobs/europe",
    tag: "Deep Tech & Crypto",
    description: "Modern remote jobs board with verified salaries, tech stacks, and timezone filters.",
  },
  {
    name: "Dealroom Scaleups",
    region: "Europe & Global",
    url: "https://dealroom.co/lists/startups-france/",
    tag: "Ecosystem Data",
    description: "Venture capital, funding rounds, and scale-up intelligence across France & Europe.",
  },
];

export async function loadRadarData(): Promise<RadarData> {
  const [startups, boards, rawJobs] = await Promise.all([
    prisma.startup.findMany({
      where: { status: { not: StartupStatus.DISMISSED } },
      select: {
        id: true,
        source: true,
        status: true,
        company: true,
        website: true,
        summary: true,
        details: true,
        location: true,
        remote: true,
        roles: true,
        links: true,
      },
      orderBy: { company: "asc" },
    }),
    prisma.startupBoard.findMany(),
    prisma.startupJob.findMany({
      where: { startup: { status: { not: StartupStatus.DISMISSED } } },
      select: {
        externalId: true,
        startupId: true,
        board: true,
        title: true,
        place: true,
        remote: true,
        department: true,
        url: true,
        postedAt: true,
        relevance: true,
        startup: { select: { id: true, company: true, website: true, location: true } },
      },
      orderBy: [{ relevance: "desc" }, { postedAt: { sort: "desc", nulls: "last" } }],
      take: 1000,
    }),
  ]);

  const boardMap = new Map(boards.map((b) => [b.startupId, b]));

  // Query scores and application states for roles
  const states = await postingStates(
    rawJobs.map((r) => ({ source: "STARTUPS" as const, externalId: r.externalId, url: r.url })),
  );

  const jobs: RadarJobItem[] = rawJobs.map((row) => {
    const key = `STARTUPS:${row.externalId}`;
    const state = states.get(key);
    const parsed = parseBoardKey(row.board);
    return {
      externalId: row.externalId,
      startupId: row.startupId,
      company: row.startup.company,
      companyWebsite: row.startup.website,
      title: row.title,
      department: row.department,
      place: row.place,
      remote: row.remote,
      url: row.url,
      postedAt: row.postedAt?.toISOString() ?? null,
      relevance: row.relevance,
      score: state?.score?.score ?? null,
      scoreReasons: state?.score?.reasons ?? [],
      boardName: parsed ? ATS_NAMES[parsed.ats] : "",
      applicationId: state?.applicationId ?? null,
      dismissed: Boolean(state?.dismissed),
    };
  });

  // Calculate job count per startup
  const jobCountByStartup = new Map<string, number>();
  for (const job of rawJobs) {
    jobCountByStartup.set(job.startupId, (jobCountByStartup.get(job.startupId) ?? 0) + 1);
  }

  // Build Company Radar Items
  const companies: RadarCompanyItem[] = startups.map((s) => {
    const board = boardMap.get(s.id);
    const parsed = board ? parseBoardKey(board.board) : null;
    const policy = policyOf(s.company, s.summary, s.details, Boolean(s.remote));
    const rolesList = Array.isArray(s.roles) ? (s.roles.filter((r): r is string => typeof r === "string")) : [];

    const careerLink = Array.isArray(s.links)
      ? (s.links as { label?: string; url?: string }[]).find((l) => /career|job/i.test(l.label ?? ""))?.url ?? ""
      : "";

    const isTracked = s.source === "RADAR" || s.status === StartupStatus.SAVED;

    return {
      id: s.id,
      name: s.company,
      policyTier: policy.tier,
      policyLabel: policy.label,
      policyDescription: policy.description,
      location: s.location,
      website: s.website,
      careersUrl: careerLink || s.website,
      boardName: parsed ? ATS_NAMES[parsed.ats] : "",
      boardUrl: parsed ? boardUrl(parsed) : "",
      jobCount: jobCountByStartup.get(s.id) ?? 0,
      keyRoles: rolesList.slice(0, 4),
      tracked: isTracked,
      source: s.source,
    };
  });

  // Sort companies: tracked first, then full remote, then remote france, then hybrid; within tier by role count desc
  const tierWeight: Record<RemotePolicyTier, number> = { FULLY_REMOTE: 0, REMOTE_FRANCE: 1, HYBRID: 2 };
  companies.sort((a, b) => {
    if (Boolean(a.tracked) !== Boolean(b.tracked)) {
      return a.tracked ? -1 : 1;
    }
    if (tierWeight[a.policyTier] !== tierWeight[b.policyTier]) {
      return tierWeight[a.policyTier] - tierWeight[b.policyTier];
    }
    return b.jobCount - a.jobCount || a.name.localeCompare(b.name);
  });

  // Compute market stats
  const remoteRolesCount = rawJobs.filter((j) => j.remote === true).length;
  const franceRolesCount = rawJobs.filter((j) => /france|paris|lyon|bordeaux|nantes|lille/i.test(j.place)).length;
  const scoredCount = jobs.filter((j) => j.score !== null).length;

  const hiringFreq = new Map<string, number>();
  for (const job of rawJobs) {
    const comp = job.startup.company;
    hiringFreq.set(comp, (hiringFreq.get(comp) ?? 0) + 1);
  }

  const topHiring = [...hiringFreq.entries()]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const stats: RadarStats = {
    totalCompanies: startups.length,
    activeBoards: boards.filter((b) => !b.error).length,
    totalRoles: rawJobs.length,
    remoteRoles: remoteRolesCount,
    franceRoles: franceRolesCount,
    scoredRoles: scoredCount,
    topHiringCompanies: topHiring,
  };

  return {
    jobs,
    companies,
    ecosystems: RADAR_ECOSYSTEMS,
    stats,
    today: new Date().toISOString(),
  };
}
