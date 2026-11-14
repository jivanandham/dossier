import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_QUERY } from "@/lib/job-search/search";
import { loadSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import type { Board, BoardJob } from "./ats";
import { loadStartupJobs, refreshStartupJobs, searchStartupJobs, startupJobPosting } from "./jobs";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const profile = vi.hoisted(() => ({
  basics: { headline: "Data Engineer", summary: "", city: "Lyon", country: "France" },
  skills: [
    { id: "1", name: "Python" },
    { id: "2", name: "Spark" },
  ],
  experience: [{ role: "Data Engineer" }, { role: "Software Engineer" }],
}));
vi.mock("@/lib/profile-data", () => ({ loadProfile: async () => profile }));
vi.mock("@/lib/log", () => ({ logServerError: vi.fn() }));

// Boards answer from here, never the internet.
const boards = vi.hoisted(() => ({ found: {} as Record<string, Board | null>, jobs: {} as Record<string, BoardJob[]>, lookedUp: [] as string[] }));
vi.mock("./ats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ats")>()),
  findBoard: vi.fn(async (startup: { company: string }) => {
    boards.lookedUp.push(startup.company);
    return boards.found[startup.company] ?? null;
  }),
  readBoard: vi.fn(async (board: Board) => boards.jobs[`${board.ats}:${board.slug}`] ?? []),
}));

// Scoring answers from here: the role's title decides its score.
const scoring = vi.hoisted(() => ({ problem: null as string | null, scored: [] as string[] }));
vi.mock("@/lib/scoring", () => ({
  scoringProblem: async () => scoring.problem,
  loadPostingScorer: async () => async (posting: { title: string }) => {
    scoring.scored.push(posting.title);
    return { data: { score: posting.title.includes("Data") ? 88 : 40, reasons: ["Fits"], redFlags: [] }, scoredWith: "test@1" };
  },
}));

const prisma = () => db.client!;

const job = (id: string, change: Partial<BoardJob> = {}): BoardJob => ({
  id,
  title: "Data Engineer",
  place: "Lyon, France",
  remote: false,
  department: "Data",
  url: `https://jobs.lever.co/acme/${id}`,
  description: "Python and Spark pipelines.",
  complete: true,
  postedAt: "2026-11-10T09:00:00.000Z",
  ...change,
});

async function startup(company: string, change: { status?: "NEW" | "SAVED" | "CONTACTED" | "DISMISSED"; score?: number } = {}) {
  return prisma().startup.create({
    data: { source: "EU", externalId: company.toLowerCase(), company, roles: [], emails: [], links: [], reasons: [], score: change.score ?? 60, status: change.status ?? "NEW" },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma());
  boards.found = {};
  boards.jobs = {};
  boards.lookedUp = [];
  scoring.problem = null;
  scoring.scored = [];
});
afterAll(() => prisma().$disconnect());

describe("Find their jobs", () => {
  it("keeps each board's roles, ranked against the profile, and what it did", async () => {
    const acme = await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [job("1"), job("2", { title: "Account Executive", description: "Sales." })];

    const run = await refreshStartupJobs();
    expect(run).toMatchObject({ startups: 1, boards: 1, jobs: 2, added: 2, problem: null });
    const rows = await prisma().startupJob.findMany({ where: { startupId: acme.id }, orderBy: { relevance: "desc" } });
    expect(rows.map((row) => [row.externalId, row.title])).toEqual([
      ["lever:acme:1", "Data Engineer"],
      ["lever:acme:2", "Account Executive"],
    ]);
    expect(rows[0].relevance).toBeGreaterThan(rows[1].relevance);
    expect((await loadSettings()).startupJobsLastRun).toMatchObject({ jobs: 2, added: 2 });
  });

  it("keeps the board for a week, and drops roles the board no longer lists", async () => {
    await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [job("1"), job("2")];
    await refreshStartupJobs(undefined, undefined, new Date("2026-11-14T10:00:00Z"));
    boards.jobs["lever:acme"] = [job("2"), job("3")];
    const run = await refreshStartupJobs(undefined, undefined, new Date("2026-11-15T10:00:00Z"));

    expect(boards.lookedUp).toEqual(["Acme"]);
    expect(run).toMatchObject({ jobs: 2, added: 1 });
    expect((await prisma().startupJob.findMany({ orderBy: { externalId: "asc" } })).map((row) => row.externalId)).toEqual(["lever:acme:2", "lever:acme:3"]);
  });

  it("remembers a startup without a board, and leaves dismissed startups out", async () => {
    await startup("Nowhere");
    await startup("Gone", { status: "DISMISSED" });
    expect(await refreshStartupJobs()).toMatchObject({ startups: 1, boards: 0, jobs: 0 });
    expect(await prisma().startupBoard.findMany({ select: { board: true } })).toEqual([{ board: "" }]);
  });

  it("scores the closest roles that have no score yet, and none below the line", async () => {
    await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [job("1"), job("2", { title: "Office Manager", description: "", place: "Paris" })];

    expect(await refreshStartupJobs()).toMatchObject({ scored: 1 });
    expect(scoring.scored).toEqual(["Data Engineer"]);
    expect(await prisma().postingScore.findMany({ select: { source: true, externalId: true, score: true } })).toEqual([{ source: "STARTUPS", externalId: "lever:acme:1", score: 88 }]);

    // Scored once: the next run doesn't score it again.
    expect(await refreshStartupJobs()).toMatchObject({ scored: 0 });
  });

  it("says why roles weren't scored", async () => {
    scoring.problem = "Choose an AI provider in Settings → AI provider first.";
    await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [job("1")];
    expect(await refreshStartupJobs()).toMatchObject({ scored: 0, problem: "Choose an AI provider in Settings → AI provider first." });
  });
});

describe("startup roles as postings", () => {
  it("are postings of source STARTUPS, with the startup as the company and the board as where they're from", async () => {
    await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [job("1")];
    await refreshStartupJobs();
    expect(await startupJobPosting("lever:acme:1")).toMatchObject({
      source: "STARTUPS",
      externalId: "lever:acme:1",
      title: "Data Engineer",
      company: "Acme",
      via: "Lever",
      url: "https://jobs.lever.co/acme/1",
      complete: true,
    });
    expect(await startupJobPosting("lever:acme:nope")).toBeNull();
  });

  it("can be searched in Find jobs by words, remote work and page", async () => {
    await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [
      job("1"),
      job("2", { title: "Backend Engineer", department: "Platform", description: "Go services.", remote: true, place: "Remote, Europe" }),
      ...Array.from({ length: 25 }, (_, index) => job(`x${index}`, { title: `Data Analyst ${index}` })),
    ];
    await refreshStartupJobs();

    expect((await searchStartupJobs({ ...EMPTY_QUERY, keywords: "go services" }, null)).postings.map((posting) => posting.externalId)).toEqual(["lever:acme:2"]);
    expect((await searchStartupJobs({ ...EMPTY_QUERY, remoteOnly: true }, null)).postings).toHaveLength(1);
    const first = await searchStartupJobs({ ...EMPTY_QUERY, keywords: "data" }, null);
    expect(first.postings).toHaveLength(20);
    expect(first.next).toBe("offset:20");
    expect((await searchStartupJobs({ ...EMPTY_QUERY, keywords: "data" }, first.next)).postings).toHaveLength(6);
  });

  it("show on the startup's card, scored first, without the ones put aside", async () => {
    const acme = await startup("Acme");
    boards.found.Acme = { ats: "lever", slug: "acme" };
    boards.jobs["lever:acme"] = [job("1"), job("2", { title: "Data Platform Engineer", place: "Paris, France" }), job("3", { title: "Data Analyst" })];
    await refreshStartupJobs();
    await prisma().posting.create({ data: { source: "STARTUPS", externalId: "lever:acme:3", title: "Data Analyst", dismissedAt: new Date() } });

    const view = (await loadStartupJobs([acme.id]))[acme.id];
    expect(view).toMatchObject({ boardName: "Lever", boardUrl: "https://jobs.lever.co/acme", total: 2, error: "" });
    expect(view.jobs.map((role) => [role.externalId, role.score?.score ?? null])).toEqual([
      ["lever:acme:1", 88],
      ["lever:acme:2", 88],
    ]);
  });
});
