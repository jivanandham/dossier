import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch, type FakeRequest } from "@/lib/ai/test-http";

import {
  forgetFranceTravailCache,
  francetravail,
  normalizePlace,
  placeFilter,
  remoteOf,
  salaryOf,
  searchParams,
  totalOf,
} from "./francetravail";
import { EMPTY_QUERY } from "./search";

const credentials = { clientId: "PAR_dossier_123", clientSecret: "ft-secret" };
const query = { ...EMPTY_QUERY, keywords: "data engineer", country: "fr" };

const COMMUNES = [
  { code: "69123", libelle: "LYON", codePostal: "69001", codeDepartement: "69" },
  { code: "42218", libelle: "SAINT ETIENNE", codePostal: "42000", codeDepartement: "42" },
  { code: "93066", libelle: "SAINT DENIS", codePostal: "93200", codeDepartement: "93" },
  { code: "97411", libelle: "SAINT DENIS", codePostal: "97400", codeDepartement: "974" },
  { code: "75101", libelle: "PARIS 01", codePostal: "75001", codeDepartement: "75" },
  { code: "33063", libelle: "BORDEAUX", codePostal: "33000", codeDepartement: "33" },
];

const OFFER = {
  id: "201ABCD",
  intitule: "Data Engineer (H/F)",
  description: "Vous rejoignez l'équipe data.\nTélétravail 2 jours par semaine.",
  dateCreation: "2026-11-10T09:30:00.000Z",
  lieuTravail: { libelle: "69 - LYON 03", codePostal: "69003" },
  entreprise: { nom: "Ledgerly France" },
  typeContrat: "CDI",
  typeContratLibelle: "Contrat à durée indéterminée",
  dureeTravailLibelle: "35H Horaires normaux",
  experienceLibelle: "3 ans",
  salaire: { libelle: "Annuel de 45000.00 Euros à 52000.00 Euros sur 12 mois", complement1: "Tickets restaurant" },
  contact: { courriel: "recrutement@ledgerly.example", urlPostulation: "https://jobs.ledgerly.example/apply/42" },
  origineOffre: { origine: "2", partenaires: [{ nom: "LEDGERLY CAREERS" }] },
};

/** The fake France Travail: a token, the communes list, and search answers from `search`. */
function fakeFranceTravail(search: (request: FakeRequest) => Response = () => json({ resultats: [OFFER] }, { status: 206, headers: { "content-range": "offres 0-49/120" } })) {
  return stubFetch((request) => {
    if (request.url.pathname.endsWith("/access_token") || request.url.pathname.endsWith("/token")) return json({ access_token: "token-1", token_type: "Bearer", expires_in: 1499 });
    if (request.headers.get("authorization") !== "Bearer token-1") return json({ message: "unauthorized" }, { status: 401 });
    if (request.url.pathname.endsWith("/referentiel/communes")) return json(COMMUNES);
    return search(request);
  });
}

const searches = (requests: FakeRequest[]) => requests.filter((request) => request.url.pathname.endsWith("/offres/search"));

beforeEach(() => forgetFranceTravailCache());
afterEach(() => vi.unstubAllGlobals());

describe("France Travail search", () => {
  it("gets a token with the client credentials, then searches with it", async () => {
    const requests = fakeFranceTravail();
    await francetravail.search({ ...query, place: "69", postedWithin: "week" }, credentials, null);
    const [token, search] = requests;
    expect(token.method).toBe("POST");
    expect(token.url.href).toBe("https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire");
    expect(token.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(`${search.url.origin}${search.url.pathname}`).toBe("https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search");
    expect(search.headers.get("authorization")).toBe("Bearer token-1");
    expect(Object.fromEntries(search.url.searchParams)).toEqual({ motsCles: "data engineer", departement: "69", publieeDepuis: "7", range: "0-49" });
  });

  it("keeps the token for the next search", async () => {
    const requests = fakeFranceTravail();
    await francetravail.search({ ...query, place: "69" }, credentials, null);
    await francetravail.search({ ...query, place: "33" }, credentials, null);
    expect(requests.filter((request) => request.url.pathname.endsWith("/access_token"))).toHaveLength(1);
  });

  it("renews a token the API refuses, once", async () => {
    let refused = false;
    const requests = fakeFranceTravail(() => {
      if (!refused) {
        refused = true;
        return json({ message: "expired" }, { status: 401 });
      }
      return json({ resultats: [] });
    });
    await francetravail.search({ ...query, place: "69" }, credentials, null);
    expect(requests.filter((request) => request.url.pathname.endsWith("/access_token"))).toHaveLength(2);
  });

  it("says the key was refused when the token endpoint turns the client down", async () => {
    stubFetch(() => json({ error: "invalid_client" }, { status: 400 }));
    await expect(francetravail.search(query, credentials, null)).rejects.toMatchObject({ problem: "key" });
  });

  it("looks a city up in the communes list and searches around it", async () => {
    const requests = fakeFranceTravail();
    await francetravail.search({ ...query, place: "Lyon", radiusKm: 50 }, credentials, null);
    const [search] = searches(requests);
    expect(search.url.searchParams.get("commune")).toBe("69123");
    expect(search.url.searchParams.get("distance")).toBe("50");
    expect(search.url.searchParams.has("departement")).toBe(false);
  });

  it("asks for the communes list only once", async () => {
    const requests = fakeFranceTravail();
    await francetravail.search({ ...query, place: "Lyon" }, credentials, null);
    await francetravail.search({ ...query, place: "Bordeaux" }, credentials, null);
    expect(requests.filter((request) => request.url.pathname.endsWith("/referentiel/communes"))).toHaveLength(1);
  });

  it("adds “télétravail” to the words for remote only, having no such filter", async () => {
    const requests = fakeFranceTravail();
    await francetravail.search({ ...query, remoteOnly: true }, credentials, null);
    expect(searches(requests)[0].url.searchParams.get("motsCles")).toBe("data engineer télétravail");
  });

  it("pages through the window the API allows, from its Content-Range", async () => {
    fakeFranceTravail();
    expect((await francetravail.search(query, credentials, null)).next).toBe("range:50");
    expect((await francetravail.search(query, credentials, "range:100")).next).toBeNull();
  });

  it("reads 204 No Content as no postings", async () => {
    fakeFranceTravail(() => new Response(null, { status: 204 }));
    expect(await francetravail.search(query, credentials, null)).toEqual({ postings: [], next: null });
  });

  it("maps an offer to the shared shape, whole, with its page on France Travail and its fields for the AI", async () => {
    fakeFranceTravail();
    const [posting] = (await francetravail.search(query, credentials, null)).postings;
    expect(posting).toMatchObject({
      source: "FRANCETRAVAIL",
      externalId: "201ABCD",
      title: "Data Engineer (H/F)",
      company: "Ledgerly France",
      place: "69 - LYON 03",
      remote: true,
      salary: "EUR 45,000–52,000 a year",
      postedAt: "2026-11-10T09:30:00.000Z",
      url: "https://candidat.francetravail.fr/offres/recherche/detail/201ABCD",
      via: "LEDGERLY CAREERS",
      complete: true,
    });
    expect(posting.description).toContain("Vous rejoignez l'équipe data.\nTélétravail 2 jours par semaine.");
    expect(posting.description).toContain("Type de contrat : Contrat à durée indéterminée");
    expect(posting.description).toContain("Candidature par e-mail : recrutement@ledgerly.example");
    expect(posting.description).toContain("Postuler : https://jobs.ledgerly.example/apply/42");
  });

  it("goes to the end-to-end tests' fake when asked", async () => {
    const requests = fakeFranceTravail();
    await francetravail.search(query, credentials, null, { baseUrl: "http://127.0.0.1:3998/francetravail" });
    expect(requests[0].url.href).toBe("http://127.0.0.1:3998/francetravail/token");
    expect(searches(requests)[0].url.href).toMatch(/^http:\/\/127\.0\.0\.1:3998\/francetravail\/offres\/search\?/);
  });
});

describe("searchParams", () => {
  it("asks for full-time, part-time or fixed-term work as the API names it", () => {
    expect(searchParams({ ...query, employmentType: "fulltime" }, null, 0).get("tempsPlein")).toBe("true");
    expect(searchParams({ ...query, employmentType: "parttime" }, null, 0).get("tempsPlein")).toBe("false");
    expect(searchParams({ ...query, employmentType: "contract" }, null, 0).get("typeContrat")).toBe("CDD,MIS");
  });

  it("rounds “posted within” up to a period the API takes, and keeps the range in its window", () => {
    expect(searchParams({ ...query, postedWithin: "month" }, null, 0).get("publieeDepuis")).toBe("31");
    expect(searchParams({ ...query, postedWithin: "3days" }, null, 0).get("publieeDepuis")).toBe("3");
    expect(searchParams(query, null, 1000).get("range")).toBe("1000-1049");
    expect(searchParams(query, null, 1120).get("range")).toBe("1120-1149");
  });
});

describe("placeFilter", () => {
  it("takes a département number as it is", () => {
    expect(placeFilter("75", [])).toEqual({ departement: "75" });
    expect(placeFilter("2a", [])).toEqual({ departement: "2A" });
    expect(placeFilter("974", [])).toEqual({ departement: "974" });
  });

  it("finds a commune by name, without accents and with “St” spelled out", () => {
    expect(placeFilter("Saint-Étienne", COMMUNES)).toEqual({ commune: "42218" });
    expect(placeFilter("St Etienne", COMMUNES)).toEqual({ commune: "42218" });
  });

  it("tells communes of the same name apart by département", () => {
    expect(placeFilter("Saint-Denis (974)", COMMUNES)).toEqual({ commune: "97411" });
    expect(placeFilter("Saint-Denis (93)", COMMUNES)).toEqual({ commune: "93066" });
  });

  it("finds a postcode's commune, or else its département", () => {
    expect(placeFilter("33000", COMMUNES)).toEqual({ commune: "33063" });
    expect(placeFilter("44000", COMMUNES)).toEqual({ departement: "44" });
  });

  it("takes Paris by its département when the list only has its arrondissements", () => {
    expect(placeFilter("Paris", COMMUNES)).toEqual({ departement: "75" });
  });

  it("searches the whole of France for an empty or unknown place", () => {
    expect(placeFilter("", COMMUNES)).toBeNull();
    expect(placeFilter("Atlantis", COMMUNES)).toBeNull();
  });

  it("normalizes names the same way on both sides", () => {
    expect(normalizePlace("Sainte-Foy-lès-Lyon")).toBe("SAINTE FOY LES LYON");
    expect(normalizePlace("L'Haÿ-les-Roses")).toBe("L HAY LES ROSES");
  });
});

describe("salaryOf", () => {
  it("gives a yearly range in euros for yearly, monthly and hourly pay", () => {
    expect(salaryOf({ libelle: "Annuel de 45000.00 Euros à 52000.00 Euros sur 12 mois", commentaire: null, complement1: null, complement2: null })).toBe(
      "EUR 45,000–52,000 a year",
    );
    expect(salaryOf({ libelle: "Mensuel de 2500.00 Euros à 3000.00 Euros sur 13 mois", commentaire: null, complement1: null, complement2: null })).toBe(
      "EUR 32,500–39,000 a year",
    );
    expect(salaryOf({ libelle: "Mensuel de 1801.80 Euros sur 12 mois", commentaire: null, complement1: null, complement2: null })).toBe("EUR 21,622 a year");
    expect(salaryOf({ libelle: "Horaire de 11.88 Euros", commentaire: null, complement1: null, complement2: null })).toBe("EUR 21,622 a year");
  });

  it("keeps what it can't read as written", () => {
    expect(salaryOf({ libelle: "Selon profil", commentaire: null, complement1: null, complement2: null })).toBe("Selon profil");
    expect(salaryOf({ libelle: null, commentaire: "À négocier", complement1: null, complement2: null })).toBe("À négocier");
    expect(salaryOf(null)).toBe("");
  });
});

describe("remoteOf", () => {
  it("reads télétravail, said or ruled out", () => {
    expect(remoteOf("Télétravail partiel possible")).toBe(true);
    expect(remoteOf("Poste en full remote")).toBe(true);
    expect(remoteOf("Télétravail non possible")).toBe(false);
    expect(remoteOf("Pas de télétravail")).toBe(false);
    expect(remoteOf("Poste sur site à Lyon")).toBeNull();
  });
});

describe("totalOf", () => {
  it("reads the total from a Content-Range", () => {
    expect(totalOf("offres 0-49/1234")).toBe(1234);
    expect(totalOf(null)).toBeNull();
  });
});

describe("France Travail test connection", () => {
  it("asks for a token and the smallest search", async () => {
    const requests = fakeFranceTravail();
    await francetravail.test(credentials);
    expect(searches(requests)[0].url.searchParams.get("range")).toBe("0-1");
  });
});
