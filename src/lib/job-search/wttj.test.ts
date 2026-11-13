import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";

import { EMPTY_QUERY } from "./search";
import { wttj } from "./wttj";

const sampleAlgoliaResponse = {
  results: [
    {
      hits: [
        {
          slug: "data-engineer_paris",
          name: "Data Engineer",
          profile: "Expert in Python and SQL with 3 years of experience.",
          published_at: "2026-11-01T10:00:00.000Z",
          organization: {
            name: "TechCorp",
            slug: "techcorp",
          },
          contract_type_names: {
            fr: "CDI",
            en: "Full-Time",
          },
          salary_currency: "EUR",
          salary_minimum: 50000,
          salary_maximum: 65000,
          salary_period: "yearly",
          office: {
            city: "Paris",
            country: "France",
            country_code: "FR",
          },
          remote: "fulltime",
        },
      ],
      nbPages: 2,
      page: 0,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Welcome to the Jungle search", () => {
  it("queries Algolia with proper index and facet filters", async () => {
    const requests = stubFetch(() => json(sampleAlgoliaResponse));
    const query = {
      ...EMPTY_QUERY,
      keywords: "data engineer",
      place: "Paris",
      country: "fr",
      remoteOnly: true,
    };
    const page = await wttj.search(query, {}, null);

    expect(requests.length).toBe(1);
    expect(requests[0].url.href).toBe("https://csekhvms53-dsn.algolia.net/1/indexes/*/queries");
    expect(requests[0].headers.get("X-Algolia-Application-Id")).toBe("CSEKHVMS53");
    expect(requests[0].headers.get("Referer")).toBe("https://www.welcometothejungle.com/");
    const body = requests[0].body as { requests: Array<{ params: string }> };
    expect(body.requests[0].params).toContain("distinct=true");

    expect(page.postings).toHaveLength(1);
    const posting = page.postings[0];
    expect(posting.source).toBe("WTTJ");
    expect(posting.title).toBe("Data Engineer");
    expect(posting.company).toBe("TechCorp");
    expect(posting.place).toBe("Paris, FR");
    expect(posting.remote).toBe(true);
    expect(posting.salary).toBe("EUR 50,000–65,000 per yearly");
    expect(posting.url).toBe("https://www.welcometothejungle.com/fr/companies/techcorp/jobs/data-engineer_paris");
    expect(posting.via).toBe("Welcome to the Jungle");
    expect(posting.description).toContain("Contrat: CDI");
    expect(posting.description).toContain("Lieu: Paris, FR");
    expect(page.next).toBe("page:1");
  });

  it("deduplicates repeated hits with the same slug and company", async () => {
    const duplicateHit = sampleAlgoliaResponse.results[0].hits[0];
    stubFetch(() =>
      json({
        results: [
          {
            hits: [duplicateHit, { ...duplicateHit }, { ...duplicateHit }],
            nbPages: 1,
            page: 0,
          },
        ],
      }),
    );
    const page = await wttj.search(EMPTY_QUERY, {}, null);
    expect(page.postings).toHaveLength(1);
  });

  it("handles pagination and end of results", async () => {
    stubFetch(() => json({ results: [{ hits: [], nbPages: 1, page: 0 }] }));
    const page = await wttj.search(EMPTY_QUERY, {}, "page:1");
    expect(page.postings).toHaveLength(0);
    expect(page.next).toBeNull();
  });
});

