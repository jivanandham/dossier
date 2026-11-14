import "server-only";

import { parse } from "node-html-parser";
import { z } from "zod";

import { wttjOrganizationPostings } from "@/lib/job-search/wttj";

import { getJson, getSitePage, SourceError } from "./http";
import { robotsAllowed } from "./robots";

// Startups' open roles (#222 follow-up): most startups list their jobs on a
// hosted job board (an "ATS") with a public, read-only feed: Greenhouse,
// Lever, Ashby, Workable, Recruitee, SmartRecruiters, or Welcome to the
// Jungle in France. Dossier finds the board in the startup's post or on its
// own careers page (read only where robots.txt allows), then reads the
// board's feed. Feeds are the boards' published APIs for exactly this:
// listing a company's jobs on other sites.

export const ATS_NAMES = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  lever_eu: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  recruitee: "Recruitee",
  smartrecruiters: "SmartRecruiters",
  wttj: "Welcome to the Jungle",
} as const;
export type Ats = keyof typeof ATS_NAMES;

/** A board: which ATS, and the company's name on it ("lever:strapi"). */
export type Board = { ats: Ats; slug: string };

export const boardKey = (board: Board) => `${board.ats}:${board.slug}`;

export function parseBoardKey(key: string): Board | null {
  const at = key.indexOf(":");
  if (at < 1) return null;
  const ats = key.slice(0, at) as Ats;
  const slug = key.slice(at + 1);
  return ats in ATS_NAMES && slug ? { ats, slug } : null;
}

/** An open role as a board lists it. */
export type BoardJob = {
  /** The board's own id for it. */
  id: string;
  title: string;
  place: string;
  remote: boolean | null;
  department: string;
  url: string;
  description: string;
  /** False when the feed gives only the start, or nothing, of the description. */
  complete: boolean;
  postedAt: string | null;
};

// ─── Finding the board ───────────────────────────────────────────────────────

/** Where each board's links look like, with the company's name on it in the first group. */
const PATTERNS: readonly [Ats, RegExp][] = [
  ["greenhouse", /\bboards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi],
  ["greenhouse", /\b(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/gi],
  ["lever_eu", /\bjobs\.eu\.lever\.co\/([a-z0-9_.-]+)/gi],
  ["lever", /\bjobs\.lever\.co\/([a-z0-9_.-]+)/gi],
  ["ashby", /\bjobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/gi],
  ["workable", /\bapply\.workable\.com\/([a-z0-9-]+)/gi],
  ["recruitee", /\b([a-z0-9-]+)\.recruitee\.com\b/gi],
  ["smartrecruiters", /\b(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/gi],
  ["wttj", /\bwelcometothejungle\.com\/[a-z]{2}\/companies\/([a-z0-9-]+)/gi],
];

/** Path parts that are a board's own pages, not a company. */
const NOT_A_COMPANY = new Set(["embed", "api", "v0", "v1", "j", "jobs", "job", "careers", "assets", "static", "www", "app", "cdn", "widget", "d", "share", "search", "companies", "oauth", "login"]);

const folded = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The job boards that `text` (a post, links, a careers page's HTML) points
 * to, the company's own first: one whose name on the board looks like
 * `company` or its domain.
 */
export function boardsIn(text: string, company = "", domain = ""): Board[] {
  const found = new Map<string, Board>();
  for (const [ats, pattern] of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const slug = decodeURIComponent(match[1]).replace(/[.]+$/, "");
      if (!slug || NOT_A_COMPANY.has(slug.toLowerCase())) continue;
      const board = { ats, slug };
      found.set(boardKey(board).toLowerCase(), board);
    }
  }
  const names = [folded(company), folded(domain.split(".")[0] ?? "")].filter((name) => name.length >= 3);
  const own = (board: Board) => names.some((name) => folded(board.slug).includes(name) || name.includes(folded(board.slug)));
  return [...found.values()].sort((a, b) => Number(own(b)) - Number(own(a)));
}

/** Links worth reading for a board: the careers or jobs pages first, then the site itself. */
export function careerPages(website: string, links: readonly { label: string; url: string }[]): string[] {
  const careers = links.filter((link) => /career|jobs?\b|join|hiring|recrut|emplois?|offres|work with us|open roles/i.test(`${link.label} ${link.url}`)).map((link) => link.url);
  const site = website && /^https?:\/\//i.test(website) ? [website] : [];
  const guesses = site.flatMap((url) => {
    try {
      const { origin } = new URL(url);
      return [`${origin}/careers`, `${origin}/jobs`];
    } catch {
      return [];
    }
  });
  return [...new Set([...careers, ...site, ...guesses])];
}

/**
 * The startup's board: from its post and links first, which costs nothing,
 * then from its careers pages, at most `pages` of them, read only where
 * robots.txt allows. Null when none is found.
 */
export async function findBoard(
  startup: { company: string; website: string; details: string; links: readonly { label: string; url: string }[] },
  { pages = 3 }: { pages?: number } = {},
): Promise<Board | null> {
  const domain = startup.website ? hostOf(startup.website) : "";
  const known = boardsIn([startup.details, startup.website, ...startup.links.map((link) => link.url)].join("\n"), startup.company, domain);
  if (known.length > 0) return known[0];

  let read = 0;
  for (const url of careerPages(startup.website, startup.links)) {
    if (read >= pages) break;
    if (!(await robotsAllowed(url).catch(() => false))) continue;
    read += 1;
    const page = await getSitePage(url, { timeoutMs: 12_000 });
    if (!page.ok) continue;
    // Where the page ended up counts too: a careers link that redirects to jobs.lever.co/acme.
    const boards = boardsIn(`${page.url}\n${page.html}`, startup.company, domain);
    if (boards.length > 0) return boards[0];
  }
  return null;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// ─── Reading a board ─────────────────────────────────────────────────────────

/** A description in HTML (or HTML escaped as text, as Greenhouse sends it) as plain text with its line breaks. */
export function htmlText(html: string | null | undefined): string {
  if (!html) return "";
  const markup = /&lt;[a-z/]/i.test(html) && !/<[a-z/]/i.test(html) ? parse(html).text : html;
  const broken = markup
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/\s*(p|div|ul|ol|h[1-6]|tr|section)\s*>/gi, "\n");
  return parse(broken)
    .text.split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const text = z.string().nullish().catch(null);
const id = z.union([z.string(), z.number()]).transform(String);
const iso = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const remoteIn = (value: string) => (/\bremote\b|t[ée]l[ée]travail|anywhere/i.test(value) ? true : null);
const list = <T extends z.ZodType>(schema: T) => z.array(z.unknown()).catch([]).transform((items) => items.flatMap((item) => {
  const parsed = schema.safeParse(item);
  return parsed.success ? [parsed.data as z.output<T>] : [];
}));

const greenhouseSchema = z.object({
  jobs: list(
    z.object({
      id,
      title: text,
      absolute_url: text,
      location: z.object({ name: text }).nullish().catch(null),
      departments: z.array(z.object({ name: text })).nullish().catch(null),
      content: text,
      first_published: text,
      updated_at: text,
    }),
  ),
});

const leverSchema = list(
  z.object({
    id,
    text,
    hostedUrl: text,
    categories: z.object({ location: text, team: text, commitment: text }).nullish().catch(null),
    workplaceType: text,
    createdAt: z.number().nullish().catch(null),
    descriptionPlain: text,
    lists: z.array(z.object({ text, content: text })).nullish().catch(null),
    additionalPlain: text,
  }),
);

const ashbySchema = z.object({
  jobs: list(
    z.object({
      id,
      title: text,
      location: text,
      department: text,
      team: text,
      isRemote: z.boolean().nullish().catch(null),
      isListed: z.boolean().nullish().catch(null),
      jobUrl: text,
      publishedAt: text,
      descriptionPlain: text,
      descriptionHtml: text,
      compensation: z.object({ compensationTierSummary: text }).nullish().catch(null),
    }),
  ),
});

const workableSchema = z.object({
  jobs: list(
    z.object({
      shortcode: id,
      title: text,
      url: text,
      city: text,
      country: text,
      telecommuting: z.boolean().nullish().catch(null),
      department: text,
      published_on: text,
      created_at: text,
      description: text,
    }),
  ),
});

const recruiteeSchema = z.object({
  offers: list(
    z.object({
      id,
      title: text,
      careers_url: text,
      location: text,
      remote: z.boolean().nullish().catch(null),
      department: text,
      status: text,
      published_at: text,
      created_at: text,
      description: text,
      requirements: text,
    }),
  ),
});

const smartRecruitersSchema = z.object({
  content: list(
    z.object({
      id,
      name: text,
      releasedDate: text,
      department: z.object({ label: text }).nullish().catch(null),
      location: z.object({ city: text, country: text, remote: z.boolean().nullish().catch(null), fullLocation: text }).nullish().catch(null),
    }),
  ),
});

const smartRecruitersJobSchema = z.object({
  jobAd: z.object({
    sections: z.record(z.string(), z.object({ title: text, text }).nullish().catch(null)).catch({}),
  }),
});

/** Description parts with a heading each, in order, the empty ones left out. */
const sections = (parts: readonly (readonly [string, string])[]) =>
  parts
    .filter(([, body]) => body.trim())
    .map(([heading, body]) => (heading ? `${heading}\n${body.trim()}` : body.trim()))
    .join("\n\n");

/** Every open role on a board. Throws a SourceError when the board can't be read. */
export async function readBoard(board: Board, signal?: AbortSignal): Promise<BoardJob[]> {
  const slug = encodeURIComponent(board.slug);
  switch (board.ats) {
    case "greenhouse": {
      const answer = greenhouseSchema.parse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, { signal }));
      return answer.jobs.map((job) => ({
        id: job.id,
        title: job.title ?? "",
        place: job.location?.name ?? "",
        remote: remoteIn(job.location?.name ?? ""),
        department: job.departments?.[0]?.name ?? "",
        url: job.absolute_url ?? "",
        description: htmlText(job.content),
        complete: Boolean(job.content),
        postedAt: iso(job.first_published ?? job.updated_at),
      }));
    }
    case "lever":
    case "lever_eu": {
      const host = board.ats === "lever_eu" ? "api.eu.lever.co" : "api.lever.co";
      const answer = leverSchema.parse(await getJson(`https://${host}/v0/postings/${slug}?mode=json`, { signal }));
      return answer.map((job) => ({
        id: job.id,
        title: job.text ?? "",
        place: job.categories?.location ?? "",
        remote: job.workplaceType === "remote" ? true : job.workplaceType === "onsite" ? false : remoteIn(job.categories?.location ?? ""),
        department: job.categories?.team ?? "",
        url: job.hostedUrl ?? "",
        description: sections([
          ["", job.descriptionPlain ?? ""],
          ...(job.lists ?? []).map((entry) => [entry.text ?? "", htmlText(entry.content)] as const),
          ["", job.additionalPlain ?? ""],
          ["", job.categories?.commitment ? `Commitment: ${job.categories.commitment}` : ""],
        ]),
        complete: true,
        postedAt: iso(job.createdAt),
      }));
    }
    case "ashby": {
      const answer = ashbySchema.parse(await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, { signal }));
      return answer.jobs
        .filter((job) => job.isListed !== false)
        .map((job) => ({
          id: job.id,
          title: job.title ?? "",
          place: job.location ?? "",
          remote: job.isRemote ?? remoteIn(job.location ?? ""),
          department: job.department ?? job.team ?? "",
          url: job.jobUrl ?? "",
          description: sections([
            ["", job.descriptionPlain ?? htmlText(job.descriptionHtml)],
            ["", job.compensation?.compensationTierSummary ? `Compensation: ${job.compensation.compensationTierSummary}` : ""],
          ]),
          complete: Boolean(job.descriptionPlain || job.descriptionHtml),
          postedAt: iso(job.publishedAt),
        }));
    }
    case "workable": {
      const answer = workableSchema.parse(await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, { signal }));
      return answer.jobs.map((job) => ({
        id: job.shortcode,
        title: job.title ?? "",
        place: [job.city, job.country].filter(Boolean).join(", "),
        remote: job.telecommuting ?? null,
        department: job.department ?? "",
        url: job.url ?? `https://apply.workable.com/${slug}/j/${encodeURIComponent(job.shortcode)}/`,
        description: htmlText(job.description),
        complete: Boolean(job.description),
        postedAt: iso(job.published_on ?? job.created_at),
      }));
    }
    case "recruitee": {
      const answer = recruiteeSchema.parse(await getJson(`https://${slug}.recruitee.com/api/offers/`, { signal }));
      return answer.offers
        .filter((offer) => !offer.status || offer.status === "published")
        .map((offer) => ({
          id: offer.id,
          title: offer.title ?? "",
          place: offer.location ?? "",
          remote: offer.remote ?? remoteIn(offer.location ?? ""),
          department: offer.department ?? "",
          url: offer.careers_url ?? "",
          description: sections([
            ["", htmlText(offer.description)],
            ["Requirements", htmlText(offer.requirements)],
          ]),
          complete: Boolean(offer.description),
          postedAt: iso(offer.published_at ?? offer.created_at),
        }));
    }
    case "smartrecruiters": {
      const answer = smartRecruitersSchema.parse(await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, { signal }));
      // The list has no descriptions: each is read when it's needed (smartRecruitersDescription).
      return answer.content.map((job) => ({
        id: job.id,
        title: job.name ?? "",
        place: job.location?.fullLocation ?? [job.location?.city, job.location?.country].filter(Boolean).join(", "),
        remote: job.location?.remote ?? null,
        department: job.department?.label ?? "",
        url: `https://jobs.smartrecruiters.com/${slug}/${encodeURIComponent(job.id)}`,
        description: "",
        complete: false,
        postedAt: iso(job.releasedDate),
      }));
    }
    case "wttj": {
      let postings;
      try {
        postings = await wttjOrganizationPostings(board.slug, signal);
      } catch {
        throw new SourceError("Welcome to the Jungle isn't answering");
      }
      return postings.map((posting) => ({
        id: posting.externalId,
        title: posting.title,
        place: posting.place,
        remote: posting.remote,
        department: "",
        url: posting.url,
        description: posting.description,
        // WTTJ's index has the profile asked for, not the whole posting.
        complete: false,
        postedAt: posting.postedAt,
      }));
    }
  }
}

/** One SmartRecruiters posting's whole description, which its list leaves out. */
export async function smartRecruitersDescription(slug: string, jobId: string, signal?: AbortSignal): Promise<string> {
  const answer = smartRecruitersJobSchema.parse(
    await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings/${encodeURIComponent(jobId)}`, { signal }),
  );
  return sections(Object.values(answer.jobAd.sections).flatMap((section) => (section ? [[section.title ?? "", htmlText(section.text)] as const] : [])));
}
