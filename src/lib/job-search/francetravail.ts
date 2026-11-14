import "server-only";

import { z } from "zod";

import type { JobSourceAdapter, RequestContext, SourceCredentials } from "./adapter";
import { JobSearchError, jobSearchError } from "./errors";
import { requestSource } from "./http";
import { POSTED_WITHIN, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";
import { fromMarkdown, plainText } from "./text";

// France Travail (formerly Pôle emploi): France's public employment service,
// through its official "Offres d'emploi v2" API on francetravail.io. Free,
// with a client ID and secret from an application subscribed to the API
// (OAuth2 client credentials). Its search sends whole postings, so nothing
// is read from the posting's page. Its licence asks for France Travail to
// be named as the source, with a link back: every posting links to its page
// on candidat.francetravail.fr, and SOURCE_INFO carries the attribution.

const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const API_BASE = "https://api.francetravail.io/partenaire/offresdemploi/v2";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
const OFFER_PAGE = "https://candidat.francetravail.fr/offres/recherche/detail/";

/** Results per request; the API allows up to 150. */
export const PAGE_SIZE = 50;
/** The API's window: a range may not start after 1000 nor end after 1149. */
const MAX_START = 1000;
const LAST_INDEX = 1149;
/** The communes list is a few MB, much more than a page of results. */
const COMMUNES_MAX_BYTES = 20 * 1024 * 1024;
/** Paid hours in a French full-time year (151.67 h a month), to turn an hourly rate into a yearly one. */
const HOURS_A_YEAR = 1820;

const maybeText = z.string().nullish().catch(null);

const offerSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  intitule: maybeText,
  description: maybeText,
  dateCreation: maybeText,
  lieuTravail: z.object({ libelle: maybeText }).nullish().catch(null),
  entreprise: z.object({ nom: maybeText }).nullish().catch(null),
  typeContrat: maybeText,
  typeContratLibelle: maybeText,
  natureContrat: maybeText,
  dureeTravailLibelle: maybeText,
  dureeTravailLibelleConverti: maybeText,
  experienceLibelle: maybeText,
  qualificationLibelle: maybeText,
  secteurActiviteLibelle: maybeText,
  alternance: z.boolean().nullish().catch(null),
  salaire: z.object({ libelle: maybeText, commentaire: maybeText, complement1: maybeText, complement2: maybeText }).nullish().catch(null),
  contact: z.object({ courriel: maybeText, urlPostulation: maybeText }).nullish().catch(null),
  origineOffre: z
    .object({ origine: maybeText, urlOrigine: maybeText, partenaires: z.array(z.object({ nom: maybeText })).nullish().catch(null) })
    .nullish()
    .catch(null),
});
type Offer = z.output<typeof offerSchema>;

const searchSchema = z.object({ resultats: z.array(z.unknown()).catch([]) });
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number().positive().catch(1499) });
const communeSchema = z.object({ code: z.string().min(1), libelle: maybeText, codePostal: maybeText, codeDepartement: maybeText });
type Commune = z.output<typeof communeSchema>;

// ─── Addresses ───────────────────────────────────────────────────────────────

/** Where the token and the API are: France Travail's own, or the end-to-end tests' fake (`/token` beside the API). */
function endpoints(context: RequestContext): { token: URL; api: string } {
  if (context.baseUrl) {
    const base = context.baseUrl.replace(/\/+$/, "");
    return { token: new URL(`${base}/token`), api: base };
  }
  return { token: new URL(TOKEN_URL), api: API_BASE };
}

// ─── OAuth2 token ────────────────────────────────────────────────────────────

/** Tokens by token URL and credentials, kept until a minute before they expire. */
const tokens = new Map<string, Promise<{ token: string; expiresAt: number }>>();

/** For the tests: forget every token and the communes list. */
export function forgetFranceTravailCache(): void {
  tokens.clear();
  communesByApi.clear();
}

async function accessToken(credentials: SourceCredentials["FRANCETRAVAIL"], context: RequestContext, fresh = false): Promise<string> {
  const { token: url } = endpoints(context);
  const key = `${url.href}\n${credentials.clientId}\n${credentials.clientSecret}`;
  const cached = fresh ? undefined : tokens.get(key);
  if (cached) {
    const value = await cached.catch(() => null);
    if (value && value.expiresAt > Date.now()) return value.token;
  }
  const request = (async () => {
    const answer = await requestSource("FRANCETRAVAIL", url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: credentials.clientId, client_secret: credentials.clientSecret, scope: SCOPE }),
      signal: context.signal,
      // An unknown client or a scope the application isn't subscribed to comes back as 400.
      keyStatuses: [400, 401, 403],
    });
    const parsed = tokenSchema.safeParse(answer.body);
    if (!parsed.success) throw jobSearchError("changed", "FRANCETRAVAIL", { detail: `${url.pathname}: unexpected token answer` });
    return { token: parsed.data.access_token, expiresAt: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000 };
  })();
  tokens.set(key, request);
  try {
    return (await request).token;
  } catch (error) {
    tokens.delete(key);
    throw error;
  }
}

/** A request to the API with a token; a refused token is renewed once, in case it expired early. */
async function apiRequest(
  path: string,
  params: URLSearchParams | null,
  credentials: SourceCredentials["FRANCETRAVAIL"],
  context: RequestContext,
  maxBytes?: number,
) {
  const url = new URL(`${endpoints(context).api}${path}`);
  if (params) url.search = params.toString();
  const send = async (fresh: boolean) =>
    requestSource("FRANCETRAVAIL", url, {
      headers: { authorization: `Bearer ${await accessToken(credentials, context, fresh)}` },
      signal: context.signal,
      maxBytes,
    });
  try {
    return await send(false);
  } catch (error) {
    if (error instanceof JobSearchError && error.problem === "key") return send(true);
    throw error;
  }
}

// ─── Place: commune, postcode or département ─────────────────────────────────

/** Upper case, without accents, with "St"/"Ste" spelled out and punctuation as spaces, so "Saint-Étienne" meets "ST ETIENNE". */
export function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (word === "ST" ? "SAINT" : word === "STE" ? "SAINTE" : word))
    .join(" ");
}

/** A département number as the API writes it: "75", "2A", "974". */
const DEPARTEMENT = /^(0[1-9]|[1-8]\d|9[0-5]|2[AB]|97[1-6])$/i;

export type PlaceFilter = { commune: string } | { departement: string } | null;

/**
 * Where to search for `place`: a département number ("69"), a postcode
 * ("33000"), a commune name ("Saint-Étienne"), or a name with its
 * département ("Saint-Denis (93)"). Paris, Lyon and Marseille also match by
 * their arrondissements. Null for an empty or unknown place: the whole of
 * France is searched.
 */
export function placeFilter(place: string, communes: readonly Commune[]): PlaceFilter {
  const text = place.trim();
  if (!text) return null;
  if (DEPARTEMENT.test(text)) return { departement: text.toUpperCase() };

  if (/^\d{5}$/.test(text)) {
    const commune = communes.find((entry) => entry.codePostal === text);
    if (commune) return { commune: commune.code };
    const departement = text.startsWith("97") ? text.slice(0, 3) : text.slice(0, 2);
    return DEPARTEMENT.test(departement) && departement !== "20" ? { departement } : null;
  }

  const withDepartement = /^(.*?)\s*\(\s*(\d{2,3}|2[AB])\s*\)$/i.exec(text);
  const name = normalizePlace(withDepartement ? withDepartement[1] : text);
  const departement = withDepartement?.[2].toUpperCase();
  if (!name) return departement && DEPARTEMENT.test(departement) ? { departement } : null;

  const inDepartement = (entry: Commune) => !departement || entry.codeDepartement?.toUpperCase() === departement;
  const exact = communes.filter((entry) => normalizePlace(entry.libelle ?? "") === name && inDepartement(entry));
  if (exact.length > 0) return { commune: exact[0].code };
  // "Paris" when the list only has "Paris 01 Arrondissement" and the like: its département.
  const within = communes.find((entry) => normalizePlace(entry.libelle ?? "").startsWith(`${name} `) && inDepartement(entry));
  if (within?.codeDepartement) return { departement: within.codeDepartement.toUpperCase() };
  return departement && DEPARTEMENT.test(departement) ? { departement } : null;
}

const communesByApi = new Map<string, Promise<Commune[]>>();

/** France Travail's list of communes, asked for once a process and only when a place needs it. */
async function communes(credentials: SourceCredentials["FRANCETRAVAIL"], context: RequestContext): Promise<Commune[]> {
  const key = endpoints(context).api;
  const cached = communesByApi.get(key);
  if (cached) return cached;
  const request = (async () => {
    const answer = await apiRequest("/referentiel/communes", null, credentials, context, COMMUNES_MAX_BYTES);
    const list = z.array(z.unknown()).safeParse(answer.body);
    if (!list.success) throw jobSearchError("changed", "FRANCETRAVAIL", { detail: "/referentiel/communes: unexpected answer" });
    return list.data.flatMap((item) => {
      const commune = communeSchema.safeParse(item);
      return commune.success ? [commune.data] : [];
    });
  })();
  communesByApi.set(key, request);
  request.catch(() => communesByApi.delete(key));
  return request;
}

/** Whether the place needs the communes list; département numbers don't. */
const needsCommunes = (place: string) => Boolean(place.trim()) && !DEPARTEMENT.test(place.trim());

// ─── Postings ────────────────────────────────────────────────────────────────

const amount = (value: number) => Math.round(value).toLocaleString("en-US");
const numberOf = (text: string) => Number(text.replace(/\s/g, "").replace(",", "."));

/**
 * France Travail's salary ("Mensuel de 2500.00 Euros à 3000.00 Euros sur
 * 13 mois") as a yearly amount in the shape the other sources use ("EUR
 * 32,500–39,000 a year"), so the salary filters read every source alike.
 * Anything else is kept as written, e.g. "Selon profil".
 */
export function salaryOf(salaire: Offer["salaire"]): string {
  const libelle = plainText(salaire?.libelle);
  const match = /^(annuel|mensuel|horaire)\s+de\s+([\d\s.,]+?)\s*euros?(?:\s+[àa]\s+([\d\s.,]+?)\s*euros?)?(?:\s+sur\s+([\d.,]+)\s*mois)?\b/i.exec(libelle);
  if (match) {
    const period = match[1].toLowerCase();
    const months = match[4] ? numberOf(match[4]) : 12;
    const factor = period === "mensuel" ? (months > 0 && months <= 16 ? months : 12) : period === "horaire" ? HOURS_A_YEAR : 1;
    const low = numberOf(match[2]) * factor;
    const high = match[3] ? numberOf(match[3]) * factor : low;
    if (Number.isFinite(low) && low > 0 && Number.isFinite(high)) {
      const range = Math.round(high) > Math.round(low) ? `${amount(low)}–${amount(high)}` : amount(low);
      return `EUR ${range} a year`;
    }
  }
  return (libelle || plainText(salaire?.commentaire)).slice(0, 200);
}

/** Whether the posting offers remote work: true when it says so, false when it rules it out, null when it doesn't say. */
export function remoteOf(text: string): boolean | null {
  if (/t[ée]l[ée]\s?-?travail\s+(?:non|impossible|pas)|pas\s+de\s+t[ée]l[ée]\s?-?travail|sans\s+t[ée]l[ée]\s?-?travail/i.test(text)) return false;
  if (/t[ée]l[ée]\s?-?travail|\bremote\b|full\s?remote|[àa]\s+distance/i.test(text)) return true;
  return null;
}

/** The posting's description, then what the API gives as fields, in French as the posting is, for the AI to read. */
function descriptionOf(offer: Offer): string {
  const facts = [
    ["Type de contrat", [offer.typeContratLibelle, offer.natureContrat].filter(Boolean).join(" · ")],
    ["Durée du travail", offer.dureeTravailLibelle ?? offer.dureeTravailLibelleConverti],
    ["Expérience", offer.experienceLibelle],
    ["Qualification", offer.qualificationLibelle],
    ["Secteur", offer.secteurActiviteLibelle],
    ["Alternance", offer.alternance ? "Oui" : null],
    ["Salaire", [offer.salaire?.libelle, offer.salaire?.commentaire, offer.salaire?.complement1, offer.salaire?.complement2].filter(Boolean).join(" · ")],
    ["Candidature par e-mail", offer.contact?.courriel],
    ["Postuler", safeLink(offer.contact?.urlPostulation ?? offer.origineOffre?.urlOrigine ?? "")],
  ]
    .filter(([, value]) => value && String(value).trim())
    .map(([label, value]) => `${label} : ${plainText(String(value))}`);
  return [fromMarkdown(offer.description), facts.join("\n")].filter(Boolean).join("\n\n");
}

export function postingFromOffer(offer: Offer): FoundPosting {
  const created = offer.dateCreation ? Date.parse(offer.dateCreation) : Number.NaN;
  const description = descriptionOf(offer);
  // A partner's posting (origine 2) names the site France Travail has it from.
  const partner = offer.origineOffre?.origine === "2" ? plainText(offer.origineOffre?.partenaires?.[0]?.nom) : "";
  return {
    source: "FRANCETRAVAIL",
    externalId: offer.id.slice(0, 500),
    title: plainText(offer.intitule).slice(0, 500),
    company: plainText(offer.entreprise?.nom).slice(0, 300),
    place: plainText(offer.lieuTravail?.libelle).slice(0, 300),
    remote: remoteOf(`${offer.intitule ?? ""}\n${offer.description ?? ""}`),
    salary: salaryOf(offer.salaire),
    postedAt: Number.isNaN(created) ? null : new Date(created).toISOString(),
    // Always its page on France Travail: the licence asks for a link back.
    url: `${OFFER_PAGE}${encodeURIComponent(offer.id)}`.slice(0, 2000),
    via: partner.slice(0, 100),
    description: description.slice(0, 100_000),
    complete: true,
  };
}

/** The API's publieeDepuis takes 1, 3, 7, 14 or 31 days. */
function publishedWithin(query: SearchQuery): string | null {
  const days = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days;
  if (!days) return null;
  return String([1, 3, 7, 14, 31].find((allowed) => allowed >= days) ?? 31);
}

/** The words, with what the API refuses taken out; "télétravail" added for remote only, as it has no such filter. */
function keywordsOf(query: SearchQuery): string {
  const words = query.keywords.replace(/[^\p{L}\p{N}\s\-+#.,'@]/gu, " ").replace(/\s+/g, " ").trim();
  return query.remoteOnly ? `${words} télétravail`.trim() : words;
}

export function searchParams(query: SearchQuery, place: PlaceFilter, start: number): URLSearchParams {
  const params = new URLSearchParams();
  const words = keywordsOf(query);
  if (words) params.set("motsCles", words);
  if (place && "commune" in place) {
    params.set("commune", place.commune);
    params.set("distance", String(query.radiusKm));
  } else if (place) {
    params.set("departement", place.departement);
  }
  const published = publishedWithin(query);
  if (published) params.set("publieeDepuis", published);
  if (query.employmentType === "fulltime") params.set("tempsPlein", "true");
  if (query.employmentType === "parttime") params.set("tempsPlein", "false");
  // Fixed-term and temping; the generic filter after the search still applies.
  if (query.employmentType === "contract") params.set("typeContrat", "CDD,MIS");
  params.set("range", `${start}-${Math.min(start + PAGE_SIZE - 1, LAST_INDEX)}`);
  return params;
}

/** The total from "offres 0-49/1234", or null when it's missing. */
export function totalOf(contentRange: string | null): number | null {
  const match = contentRange ? /\/(\d+)\s*$/.exec(contentRange) : null;
  return match ? Number(match[1]) : null;
}

async function searchPage(query: SearchQuery, credentials: SourceCredentials["FRANCETRAVAIL"], next: string | null, context: RequestContext = {}): Promise<SearchPage> {
  const start = next?.startsWith("range:") ? Math.max(0, Math.min(MAX_START, Number(next.slice("range:".length)) || 0)) : 0;
  const place = needsCommunes(query.place) ? placeFilter(query.place, await communes(credentials, context)) : placeFilter(query.place, []);
  const answer = await apiRequest("/offres/search", searchParams(query, place, start), credentials, context);
  // 204: nothing found.
  if (answer.body === null) return { postings: [], next: null };
  const parsed = searchSchema.safeParse(answer.body);
  if (!parsed.success) throw jobSearchError("changed", "FRANCETRAVAIL", { detail: "/offres/search: unexpected answer" });

  const seen = new Set<string>();
  const postings: FoundPosting[] = [];
  for (const item of parsed.data.resultats) {
    const offer = offerSchema.safeParse(item);
    if (!offer.success || seen.has(offer.data.id)) continue;
    seen.add(offer.data.id);
    postings.push(postingFromOffer(offer.data));
  }

  // 206 means there's more; the Content-Range says how much.
  const total = totalOf(answer.headers.get("content-range")) ?? (answer.status === 206 ? Number.POSITIVE_INFINITY : 0);
  const following = start + PAGE_SIZE;
  const more = parsed.data.resultats.length > 0 && following < total && following <= MAX_START;
  return { postings, next: more ? `range:${following}` : null };
}

export const francetravail: JobSourceAdapter<"FRANCETRAVAIL"> = {
  source: "FRANCETRAVAIL",
  search: searchPage,
  // The search sends whole postings; this reads one again, for one kept from before.
  details: async (posting, credentials, context = {}) => {
    const answer = await apiRequest(`/offres/${encodeURIComponent(posting.externalId)}`, null, credentials, context);
    const offer = offerSchema.safeParse(answer.body);
    return offer.success ? postingFromOffer(offer.data).description : null;
  },
  // A token, then the smallest search: a département, two results.
  test: async (credentials, context = {}) => {
    const params = new URLSearchParams({ motsCles: "developpeur", departement: "75", range: "0-1" });
    await apiRequest("/offres/search", params, credentials, context);
  },
};
