import "server-only";

import { z } from "zod";

import { fetchPosting } from "@/lib/posting-fetch";

import type { JobSourceAdapter, RequestContext } from "./adapter";
import { jobSearchError } from "./errors";
import { safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";

// Welcome to the Jungle: Tech, startup and digital jobs in France and Europe (no key).
// Searches via Algolia's public search endpoint for wk_cms_jobs_production index.

const ALGOLIA_URL = "https://csekhvms53-dsn.algolia.net/1/indexes/*/queries";
const APP_ID = "CSEKHVMS53";
const API_KEY = "4bd8f6215d0cc52b26430765769e65a0";
const INDEX_NAME = "wk_cms_jobs_production";
const PAGE_SIZE = 20;

const maybeText = z.string().nullish().catch(null);
const maybeNumber = z.number().nullish().catch(null);

const officeSchema = z
  .object({
    city: maybeText,
    country: maybeText,
    country_code: maybeText,
  })
  .nullish()
  .catch(null);

const orgSchema = z
  .object({
    name: maybeText,
    slug: maybeText,
    descriptions: z
      .object({
        fr: maybeText,
        en: maybeText,
      })
      .nullish()
      .catch(null),
  })
  .nullish()
  .catch(null);

const contractSchema = z
  .object({
    fr: maybeText,
    en: maybeText,
  })
  .nullish()
  .catch(null);

const hitSchema = z.object({
  slug: z.string().min(1),
  name: maybeText,
  profile: maybeText,
  published_at: maybeText,
  organization: orgSchema,
  contract_type_names: contractSchema,
  salary_currency: maybeText,
  salary_minimum: maybeNumber,
  salary_maximum: maybeNumber,
  salary_period: maybeText,
  office: officeSchema,
  remote: maybeText,
});
type Hit = z.output<typeof hitSchema>;

function salaryOf(hit: Hit): string {
  const min = hit.salary_minimum;
  const max = hit.salary_maximum;
  if (min == null && max == null) return "";
  const currency = hit.salary_currency ?? "EUR";
  const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const range = min != null && max != null && min !== max ? `${amount(min)}–${amount(max)}` : amount((min ?? max)!);
  const period = hit.salary_period ? ` per ${hit.salary_period}` : "";
  return `${currency} ${range}${period}`;
}

function remoteOf(remote: string | null | undefined): boolean | null {
  if (remote === "fulltime") return true;
  if (remote === "no") return false;
  return null;
}

function postedAtOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function postingUrl(hit: Hit): string {
  const orgSlug = hit.organization?.slug;
  if (orgSlug) {
    return `https://www.welcometothejungle.com/fr/companies/${orgSlug}/jobs/${hit.slug}`;
  }
  return `https://www.welcometothejungle.com/fr/jobs/${hit.slug}`;
}

export function postingFromHit(hit: Hit): FoundPosting {
  const contract = hit.contract_type_names?.fr || hit.contract_type_names?.en;
  const city = hit.office?.city;
  const countryCode = hit.office?.country_code;
  const place = [city, countryCode].filter(Boolean).join(", ");
  const orgDesc = hit.organization?.descriptions?.fr || hit.organization?.descriptions?.en;

  const parts = [
    contract ? `Contrat: ${contract}` : "",
    place ? `Lieu: ${place}` : "",
    hit.profile ? hit.profile.trim() : "",
    orgDesc && !hit.profile ? `À propos de ${hit.organization?.name ?? "l'entreprise"}:\n${orgDesc.trim()}` : "",
  ].filter(Boolean);

  const description = parts.join("\n\n").slice(0, 100_000);

  return {
    source: "WTTJ",
    externalId: hit.slug.slice(0, 500),
    title: (hit.name ?? "").trim().slice(0, 500),
    company: (hit.organization?.name ?? "").trim().slice(0, 300),
    place: place.slice(0, 300),
    remote: remoteOf(hit.remote),
    salary: salaryOf(hit).slice(0, 200),
    postedAt: postedAtOf(hit.published_at),
    url: safeLink(postingUrl(hit)).slice(0, 2000),
    via: "Welcome to the Jungle",
    description,
    complete: true,
  };
}

function pageNumber(next: string | null): number {
  if (!next?.startsWith("page:")) return 0;
  return Math.max(0, Number(next.slice("page:".length)) || 0);
}

async function searchPage(
  query: SearchQuery,
  _credentials: Record<string, never>,
  next: string | null,
  context: RequestContext = {},
): Promise<SearchPage> {
  const page = pageNumber(next);
  const q = [query.keywords, query.place].filter(Boolean).join(" ");

  const facetFilters: string[][] = [];
  if (query.country) {
    facetFilters.push([`office.country_code:${query.country.toUpperCase()}`]);
  }
  if (query.remoteOnly) {
    facetFilters.push(["remote:fulltime"]);
  }

  const paramsObj: Record<string, string> = {
    page: String(page),
    hitsPerPage: String(PAGE_SIZE),
    distinct: "true",
  };
  if (facetFilters.length > 0) {
    paramsObj.facetFilters = JSON.stringify(facetFilters);
  }
  const paramsStr = new URLSearchParams(paramsObj).toString();

  const endpoint = context.baseUrl ?? ALGOLIA_URL;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": APP_ID,
        "X-Algolia-API-Key": API_KEY,
        "Content-Type": "application/json",
        Referer: "https://www.welcometothejungle.com/",
      },
      body: JSON.stringify({
        requests: [
          {
            indexName: INDEX_NAME,
            query: q,
            params: paramsStr,
          },
        ],
      }),
      signal: context.signal,
    });
  } catch (error) {
    throw jobSearchError("unavailable", "WTTJ", { detail: String(error) });
  }

  if (!response.ok) {
    throw jobSearchError("unavailable", "WTTJ", { detail: `HTTP ${response.status}` });
  }

  const json = (await response.json()) as {
    results?: Array<{
      hits?: unknown[];
      nbPages?: number;
      page?: number;
    }>;
  };

  const result = json.results?.[0];
  const hitsRaw = result?.hits ?? [];
  const nbPages = result?.nbPages ?? 1;

  const postings: FoundPosting[] = [];
  const seen = new Set<string>();
  for (const item of hitsRaw) {
    const parsed = hitSchema.safeParse(item);
    if (!parsed.success) continue;
    const posting = postingFromHit(parsed.data);
    const key = `${posting.company}:${posting.externalId}`;
    if (seen.has(key) || (posting.url && seen.has(posting.url))) continue;
    seen.add(key);
    if (posting.url) seen.add(posting.url);
    postings.push(posting);
  }

  const hasMore = page + 1 < nbPages;
  return {
    postings,
    next: hasMore ? `page:${page + 1}` : null,
  };
}

export const wttj: JobSourceAdapter<"WTTJ"> = {
  source: "WTTJ",
  search: searchPage,
  details: async (posting) => {
    if (!posting.url) return null;
    const page = await fetchPosting(posting.url);
    return page.ok ? page.text : null;
  },
  test: async (_credentials, context) => {
    await searchPage(
      { keywords: "developer", place: "", country: "fr", radiusKm: 25, remoteOnly: false, postedWithin: "any" },
      {},
      null,
      context,
    );
  },
};

/**
 * Every open role of one company on Welcome to the Jungle (its page
 * welcometothejungle.com/…/companies/<slug>), for Startups' job boards.
 * Limited in time like the other sources' requests.
 */
export async function wttjOrganizationPostings(slug: string, signal?: AbortSignal): Promise<FoundPosting[]> {
  const timeout = AbortSignal.timeout(15_000);
  const params = new URLSearchParams({ page: "0", hitsPerPage: "100", facetFilters: JSON.stringify([[`organization.slug:${slug}`]]) }).toString();
  let response: Response;
  try {
    response = await fetch(ALGOLIA_URL, {
      method: "POST",
      headers: { "X-Algolia-Application-Id": APP_ID, "X-Algolia-API-Key": API_KEY, "Content-Type": "application/json", Referer: "https://www.welcometothejungle.com/" },
      body: JSON.stringify({ requests: [{ indexName: INDEX_NAME, query: "", params }] }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    throw jobSearchError("unavailable", "WTTJ", { detail: timeout.aborted ? "organization: timed out" : String(error) });
  }
  if (!response.ok) throw jobSearchError("unavailable", "WTTJ", { detail: `organization: HTTP ${response.status}` });
  let json: { results?: Array<{ hits?: unknown[] }> };
  try {
    json = (await response.json()) as typeof json;
  } catch {
    throw jobSearchError("changed", "WTTJ", { detail: "organization: not JSON" });
  }
  return (json.results?.[0]?.hits ?? []).flatMap((item) => {
    const parsed = hitSchema.safeParse(item);
    return parsed.success ? [postingFromHit(parsed.data)] : [];
  });
}
