import "server-only";

import { z } from "zod";

import { StartupStatus } from "@/generated/prisma/enums";
import { AiError } from "@/lib/ai/errors";
import { POSTED_WITHIN, postingKey, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "@/lib/job-search/search";
import { defineJob, findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { logServerError } from "@/lib/log";
import { fetchPosting } from "@/lib/posting-fetch";
import { saveScore } from "@/lib/posting-scores";
import { postingStates } from "@/lib/postings";
import { prisma } from "@/lib/prisma";
import type { ProfileData } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-data";
import { loadPostingScorer, scoringProblem } from "@/lib/scoring";
import { saveSettings } from "@/lib/settings-data";

import { ATS_NAMES, boardKey, findBoard, parseBoardKey, readBoard, smartRecruitersDescription, type Board, type BoardJob } from "./ats";
import { SourceError } from "./http";
import { placeOf, type Place } from "./place";
import { relevanceOf } from "./relevance";
import { startupJobsRunSchema, startupLinkSchema, type StartupJobCard, type StartupJobsRun, type StartupJobsView } from "./types";

// The open roles of the startups on the Startups screen: read from each
// startup's job board, ranked against the profile in code (free), and the
// closest ones scored by the scorer Settings → Scoring chose, as Find jobs
// scores postings. Each role is a posting of source STARTUPS, so its score,
// "Start application", Find jobs and the job agent work as for any other.

export const STARTUP_JOBS_KEY = "startup-jobs";
/** The best-matching startups looked at per run. */
const STARTUPS_PER_RUN = 40;
/** Boards read at once. */
const CONCURRENCY = 4;
/** A startup's board, or the lack of one, is looked for again after this long. */
const BOARD_DAYS = 7;
/** Roles kept per board: a big company's board isn't a startup's. */
const ROLES_PER_BOARD = 150;
/** Roles scored per run, the most relevant first, and how relevant a role must be to be scored. */
export const SCORES_PER_RUN = 15;
export const MIN_RELEVANCE = 30;
/** Roles shown per startup on the screen. */
const ROLES_SHOWN = 8;
const DAY_MS = 86_400_000;

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const words = (text: string) => fold(text).split(/[^a-z0-9+#]+/).filter((word) => word.length >= 2);

// ─── Reading the boards ──────────────────────────────────────────────────────

type StartupRow = Awaited<ReturnType<typeof startupsToRead>>[number];

const startupsToRead = (take: number) =>
  prisma.startup.findMany({
    where: { status: { in: [StartupStatus.NEW, StartupStatus.SAVED, StartupStatus.CONTACTED] } },
    orderBy: { score: "desc" },
    take,
    select: { id: true, company: true, website: true, details: true, links: true, board: true },
  });

/** The startup's board: the one kept, while it's recent, or else looked for again and kept. */
async function boardOf(startup: StartupRow, now: Date): Promise<Board | null> {
  const kept = startup.board;
  if (kept && now.getTime() - kept.checkedAt.getTime() < BOARD_DAYS * DAY_MS) return parseBoardKey(kept.board);
  const links = startupLinkSchema.array().catch([]).parse(startup.links ?? []);
  let board: Board | null = null;
  let error = "";
  try {
    board = await findBoard({ company: startup.company, website: startup.website, details: startup.details, links });
  } catch (problem) {
    error = problem instanceof SourceError ? `Its site ${problem.message}` : "Its site couldn't be read";
    if (!(problem instanceof SourceError)) logServerError("startups: board lookup", problem);
  }
  const data = { board: board ? boardKey(board) : "", error, checkedAt: now };
  await prisma.startupBoard.upsert({ where: { startupId: startup.id }, create: { startupId: startup.id, ...data }, update: data });
  return board;
}

/** Reads a board and keeps its roles, ranked; roles it no longer lists go. Returns how many it lists and how many are new. */
async function keepRoles(startupId: string, board: Board, profile: ProfileData, place: Place, now: Date, signal: AbortSignal): Promise<{ listed: number; added: number }> {
  let found: BoardJob[];
  try {
    found = (await readBoard(board, signal)).filter((job) => job.title.trim()).slice(0, ROLES_PER_BOARD);
  } catch (problem) {
    const error = problem instanceof SourceError ? `${ATS_NAMES[board.ats]} ${problem.message}` : `${ATS_NAMES[board.ats]} couldn't be read`;
    if (!(problem instanceof SourceError)) logServerError("startups: board read", problem);
    await prisma.startupBoard.update({ where: { startupId }, data: { error } });
    return { listed: 0, added: 0 };
  }
  const prefix = `${boardKey(board)}:`;
  const known = new Set(
    (await prisma.startupJob.findMany({ where: { startupId }, select: { externalId: true } })).map((row) => row.externalId),
  );
  let added = 0;
  await prisma.$transaction(async (tx) => {
    for (const job of found) {
      const externalId = `${prefix}${job.id}`.slice(0, 500);
      if (!known.has(externalId)) added += 1;
      const fields = {
        startupId,
        board: boardKey(board),
        title: job.title.trim().slice(0, 500),
        place: job.place.trim().slice(0, 300),
        remote: job.remote,
        department: job.department.trim().slice(0, 200),
        url: safeLink(job.url).slice(0, 2000),
        postedAt: job.postedAt ? new Date(job.postedAt) : null,
        relevance: relevanceOf(job, profile, place),
        seenAt: now,
      };
      // A description read in full before isn't replaced by the start of it.
      const text = job.complete || job.description ? { description: job.description.slice(0, 100_000), complete: job.complete } : {};
      await tx.startupJob.upsert({
        where: { externalId },
        create: { externalId, ...fields, description: job.description.slice(0, 100_000), complete: job.complete },
        update: { ...fields, ...text },
      });
    }
    await tx.startupJob.deleteMany({ where: { startupId, seenAt: { lt: now } } });
    await tx.startupBoard.update({ where: { startupId }, data: { error: "" } });
  });
  return { listed: found.length, added };
}

// ─── Roles as postings ───────────────────────────────────────────────────────

type JobRow = { externalId: string; board: string; title: string; place: string; remote: boolean | null; url: string; description: string; complete: boolean; postedAt: Date | null };

/** A role as a posting of source STARTUPS, for scoring, Find jobs and New application. */
export function postingOf(row: JobRow, company: string): FoundPosting {
  const board = parseBoardKey(row.board);
  return {
    source: "STARTUPS",
    externalId: row.externalId.slice(0, 500),
    title: row.title.slice(0, 500),
    company: company.slice(0, 300),
    place: row.place.slice(0, 300),
    remote: row.remote,
    salary: "",
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    url: safeLink(row.url).slice(0, 2000),
    via: board ? ATS_NAMES[board.ats] : "",
    description: row.description.slice(0, 100_000),
    complete: row.complete,
  };
}

/** A role's whole description, read from its board or its page when only the start is kept, and kept from then on. */
export async function startupJobDetails(externalId: string, signal?: AbortSignal): Promise<string | null> {
  const row = await prisma.startupJob.findUnique({ where: { externalId } });
  if (!row) return null;
  if (row.complete) return row.description;
  const board = parseBoardKey(row.board);
  let text: string | null = null;
  try {
    if (board?.ats === "smartrecruiters") text = await smartRecruitersDescription(board.slug, externalId.slice(`${row.board}:`.length), signal);
    else if (row.url) {
      const page = await fetchPosting(row.url);
      text = page.ok ? page.text : null;
    }
  } catch (problem) {
    if (!(problem instanceof SourceError)) logServerError("startups: role details", problem);
  }
  if (!text?.trim()) return row.description || null;
  await prisma.startupJob.update({ where: { externalId }, data: { description: text.slice(0, 100_000), complete: true } });
  return text;
}

/** A role as a posting, with its whole description when it can be had (unless `whole` is false); null when it's gone. */
export async function startupJobPosting(externalId: string, { whole = true }: { whole?: boolean } = {}): Promise<FoundPosting | null> {
  const row = await prisma.startupJob.findUnique({ where: { externalId }, include: { startup: { select: { company: true } } } });
  if (!row) return null;
  const posting = postingOf(row, row.startup.company);
  if (posting.complete || !whole) return posting;
  const text = await startupJobDetails(externalId);
  return text ? { ...posting, description: text.slice(0, 100_000), complete: true } : posting;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Scores the most relevant roles that have no score yet, at most `limit`. Returns how many, and why it stopped early. */
export async function scoreStartupJobs(limit: number, signal: AbortSignal, step: (name: string) => Promise<void> = async () => {}): Promise<{ scored: number; problem: string | null }> {
  const problem = await scoringProblem();
  if (problem) return { scored: 0, problem };
  const rows = await prisma.startupJob.findMany({
    where: { relevance: { gte: MIN_RELEVANCE }, startup: { status: { not: StartupStatus.DISMISSED } } },
    orderBy: [{ relevance: "desc" }, { postedAt: { sort: "desc", nulls: "last" } }],
    take: 300,
    select: { externalId: true },
  });
  const done = new Set(
    (await prisma.postingScore.findMany({ where: { source: "STARTUPS", externalId: { in: rows.map((row) => row.externalId) } }, select: { externalId: true } })).map(
      (row) => row.externalId,
    ),
  );
  const dismissed = new Set(
    (await prisma.posting.findMany({ where: { source: "STARTUPS", dismissedAt: { not: null } }, select: { externalId: true } })).map((row) => row.externalId),
  );
  const todo = rows.filter((row) => !done.has(row.externalId) && !dismissed.has(row.externalId)).slice(0, limit);
  if (todo.length === 0) return { scored: 0, problem: null };

  await step(`Scoring the ${todo.length} closest ${todo.length === 1 ? "role" : "roles"} against your profile`);
  const [score, profile] = await Promise.all([loadPostingScorer(), loadProfile()]);
  let scored = 0;
  let stopped: string | null = null;
  for (const { externalId } of todo) {
    if (signal.aborted) break;
    try {
      const posting = await startupJobPosting(externalId);
      if (!posting) continue;
      const { data, scoredWith } = await score(posting, profile, signal);
      if (signal.aborted) break;
      await saveScore(posting, data, scoredWith);
      scored += 1;
    } catch (error) {
      if (error instanceof AiError) {
        stopped = error.message;
        // A model that isn't set up won't be for the next role either.
        if (error.kind === "config") break;
      } else if (!signal.aborted) logServerError("startups: role scoring", error);
    }
  }
  return { scored, problem: stopped };
}

// ─── The run ─────────────────────────────────────────────────────────────────

/** "Find their jobs": the best-matching startups' boards, read, their roles ranked, and the closest scored. */
export async function refreshStartupJobs(
  step: (name: string) => Promise<void> = async () => {},
  signal: AbortSignal = new AbortController().signal,
  now = new Date(),
): Promise<StartupJobsRun> {
  const profile = await loadProfile();
  const place = placeOf(profile.basics);
  const startups = await startupsToRead(STARTUPS_PER_RUN);

  await step(`Finding the job boards of ${startups.length} ${startups.length === 1 ? "startup" : "startups"}`);
  let boards = 0;
  let jobs = 0;
  let added = 0;
  for (let index = 0; index < startups.length; index += CONCURRENCY) {
    signal.throwIfAborted();
    const batch = startups.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (startup) => {
        const board = await boardOf(startup, now);
        if (!board) return null;
        return keepRoles(startup.id, board, profile, place, now, signal);
      }),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        if (!signal.aborted) logServerError("startups: roles", result.reason);
        continue;
      }
      if (!result.value) continue;
      boards += 1;
      jobs += result.value.listed;
      added += result.value.added;
    }
    await step(`Read ${Math.min(index + batch.length, startups.length)} of ${startups.length} startups · ${jobs} open ${jobs === 1 ? "role" : "roles"} so far`);
  }

  const { scored, problem } = await scoreStartupJobs(SCORES_PER_RUN, signal, step);
  const run: StartupJobsRun = { at: now.toISOString(), startups: startups.length, boards, jobs, added, scored, problem };
  await saveSettings({ startupJobsLastRun: run });
  return run;
}

export const startupJobsJob = defineJob({
  type: STARTUP_JOBS_KEY,
  input: z.object({}),
  result: startupJobsRunSchema,
  run: (_input, { step, signal }) => refreshStartupJobs(step, signal),
});

/** Starts "Find their jobs" unless it's under way; returns its job. */
export async function startStartupJobs(): Promise<string> {
  const [running] = await findUnfinishedJobs(STARTUP_JOBS_KEY);
  return running?.id ?? startJob(startupJobsJob, {}, { key: STARTUP_JOBS_KEY });
}

// ─── Find jobs: the STARTUPS source ──────────────────────────────────────────

const SEARCH_PAGE = 20;
/** Roles a search looks through: plenty for one person's list of startups. */
const SEARCH_LIMIT = 3000;

/** A search of the roles kept from startups' boards, in the database: nothing leaves the server. */
export async function searchStartupJobs(query: SearchQuery, next: string | null, now = new Date()): Promise<SearchPage> {
  const offset = next?.startsWith("offset:") ? Math.max(0, Number(next.slice("offset:".length)) || 0) : 0;
  const rows = await prisma.startupJob.findMany({
    where: { startup: { status: { not: StartupStatus.DISMISSED } } },
    orderBy: [{ relevance: "desc" }, { postedAt: { sort: "desc", nulls: "last" } }],
    take: SEARCH_LIMIT,
    include: { startup: { select: { company: true } } },
  });
  const wanted = words(query.keywords);
  const placeWanted = fold(query.place.trim());
  const days = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days ?? null;
  const since = days ? now.getTime() - days * DAY_MS : null;
  const matching = rows.filter((row) => {
    if (query.remoteOnly && row.remote !== true) return false;
    if (placeWanted && !fold(row.place).includes(placeWanted) && row.remote !== true) return false;
    if (since !== null && (!row.postedAt || row.postedAt.getTime() < since)) return false;
    if (wanted.length === 0) return true;
    const text = fold([row.title, row.department, row.startup.company, row.description].join(" "));
    return wanted.every((word) => text.includes(word));
  });
  const page = matching.slice(offset, offset + SEARCH_PAGE).map((row) => postingOf(row, row.startup.company));
  return { postings: page, next: offset + SEARCH_PAGE < matching.length ? `offset:${offset + SEARCH_PAGE}` : null };
}

// ─── The Startups screen ─────────────────────────────────────────────────────

/** Where a board's own page is, for a link on the card. */
export function boardUrl(board: Board): string {
  const slug = encodeURIComponent(board.slug);
  switch (board.ats) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "lever_eu":
      return `https://jobs.eu.lever.co/${slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
    case "workable":
      return `https://apply.workable.com/${slug}/`;
    case "recruitee":
      return `https://${slug}.recruitee.com/`;
    case "smartrecruiters":
      return `https://jobs.smartrecruiters.com/${slug}`;
    case "wttj":
      return `https://www.welcometothejungle.com/fr/companies/${slug}/jobs`;
  }
}

/** Each startup's board and its best roles for the profile: scored ones by score, then the most relevant. Dismissed roles are left out. */
export async function loadStartupJobs(startupIds: readonly string[]): Promise<Record<string, StartupJobsView>> {
  if (startupIds.length === 0) return {};
  const [boards, rows] = await Promise.all([
    prisma.startupBoard.findMany({ where: { startupId: { in: [...startupIds] } } }),
    prisma.startupJob.findMany({
      where: { startupId: { in: [...startupIds] } },
      orderBy: [{ relevance: "desc" }, { postedAt: { sort: "desc", nulls: "last" } }],
      select: { startupId: true, externalId: true, board: true, title: true, place: true, remote: true, department: true, url: true, postedAt: true, relevance: true },
    }),
  ]);
  const states = await postingStates(rows.map((row) => ({ source: "STARTUPS" as const, externalId: row.externalId, url: row.url })));
  const views: Record<string, StartupJobsView> = {};
  for (const board of boards) {
    const parsed = parseBoardKey(board.board);
    views[board.startupId] = {
      boardName: parsed ? ATS_NAMES[parsed.ats] : "",
      boardUrl: parsed ? boardUrl(parsed) : "",
      checkedAt: board.checkedAt.toISOString(),
      error: board.error,
      total: 0,
      jobs: [],
    };
  }
  for (const row of rows) {
    const state = states.get(postingKey({ source: "STARTUPS", externalId: row.externalId }));
    if (state?.dismissed) continue;
    const view = (views[row.startupId] ??= { boardName: "", boardUrl: "", checkedAt: null, error: "", total: 0, jobs: [] });
    view.total += 1;
    const card: StartupJobCard = {
      externalId: row.externalId,
      title: row.title,
      place: row.place,
      remote: row.remote,
      department: row.department,
      url: row.url,
      postedAt: row.postedAt ? row.postedAt.toISOString() : null,
      relevance: row.relevance,
      score: state?.score ?? null,
      applicationId: state?.applicationId ?? null,
    };
    view.jobs.push(card);
  }
  for (const view of Object.values(views)) {
    view.jobs.sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1) || b.relevance - a.relevance);
    view.jobs = view.jobs.slice(0, ROLES_SHOWN);
  }
  return views;
}
