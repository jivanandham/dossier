import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";

import { boardsIn, careerPages, findBoard, htmlText, parseBoardKey, readBoard } from "./ats";

vi.mock("@/lib/env", () => ({ env: {} }));
const robotsAllowed = vi.hoisted(() => vi.fn(async () => true));
vi.mock("./robots", () => ({ robotsAllowed }));
const getSitePage = vi.hoisted(() => vi.fn());
vi.mock("./http", async (importOriginal) => ({ ...(await importOriginal<typeof import("./http")>()), getSitePage }));

afterEach(() => {
  vi.unstubAllGlobals();
  getSitePage.mockReset();
  robotsAllowed.mockReset().mockResolvedValue(true);
});

describe("boardsIn", () => {
  it("finds each board's company name in its links", () => {
    expect(boardsIn("Apply at https://jobs.lever.co/strapi/123")).toEqual([{ ats: "lever", slug: "strapi" }]);
    expect(boardsIn("https://jobs.eu.lever.co/qonto")).toEqual([{ ats: "lever_eu", slug: "qonto" }]);
    expect(boardsIn('<script src="https://boards.greenhouse.io/embed/job_board/js?for=alan"></script>')).toEqual([{ ats: "greenhouse", slug: "alan" }]);
    expect(boardsIn("https://job-boards.greenhouse.io/doctolib/jobs/42")).toEqual([{ ats: "greenhouse", slug: "doctolib" }]);
    expect(boardsIn("https://jobs.ashbyhq.com/mistral")).toEqual([{ ats: "ashby", slug: "mistral" }]);
    expect(boardsIn("https://apply.workable.com/phantombuster/j/ABC123/")).toEqual([{ ats: "workable", slug: "phantombuster" }]);
    expect(boardsIn("https://acme.recruitee.com/o/backend")).toEqual([{ ats: "recruitee", slug: "acme" }]);
    expect(boardsIn("https://jobs.smartrecruiters.com/Ubisoft2/7437")).toEqual([{ ats: "smartrecruiters", slug: "Ubisoft2" }]);
    expect(boardsIn("https://www.welcometothejungle.com/fr/companies/swile/jobs")).toEqual([{ ats: "wttj", slug: "swile" }]);
  });

  it("leaves out a board's own pages", () => {
    expect(boardsIn("https://boards.greenhouse.io/embed/job_app?token=1 https://app.recruitee.com/login")).toEqual([]);
  });

  it("puts the company's own board first", () => {
    const text = "Partners: https://jobs.lever.co/otherco · Us: https://jobs.ashbyhq.com/acme-labs";
    expect(boardsIn(text, "Acme Labs", "acmelabs.io")[0]).toEqual({ ats: "ashby", slug: "acme-labs" });
  });
});

describe("careerPages", () => {
  it("reads careers links first, then the site, then its usual careers paths", () => {
    expect(
      careerPages("https://acme.io", [
        { label: "Website", url: "https://acme.io" },
        { label: "Careers & Jobs", url: "https://acme.io/careers" },
        { label: "Blog", url: "https://acme.io/blog" },
      ]),
    ).toEqual(["https://acme.io/careers", "https://acme.io", "https://acme.io/jobs"]);
  });
});

describe("findBoard", () => {
  it("takes a board from the post without reading the site", async () => {
    const board = await findBoard({ company: "Acme", website: "https://acme.io", details: "We're hiring: https://jobs.lever.co/acme", links: [] });
    expect(board).toEqual({ ats: "lever", slug: "acme" });
    expect(getSitePage).not.toHaveBeenCalled();
  });

  it("reads the careers page, where robots.txt allows, for an embedded board or a redirect", async () => {
    getSitePage.mockResolvedValueOnce({ ok: true, url: "https://jobs.ashbyhq.com/acme", html: "<html></html>" });
    const board = await findBoard({ company: "Acme", website: "https://acme.io", details: "", links: [{ label: "Careers", url: "https://acme.io/careers" }] });
    expect(board).toEqual({ ats: "ashby", slug: "acme" });
    expect(getSitePage).toHaveBeenCalledWith("https://acme.io/careers", expect.anything());
  });

  it("doesn't read a page robots.txt keeps it out of", async () => {
    robotsAllowed.mockResolvedValue(false);
    expect(await findBoard({ company: "Acme", website: "https://acme.io", details: "", links: [] })).toBeNull();
    expect(getSitePage).not.toHaveBeenCalled();
  });
});

describe("htmlText", () => {
  it("keeps paragraphs and list items as lines, and reads Greenhouse's escaped HTML", () => {
    expect(htmlText("<p>About us</p><ul><li>Go</li><li>Postgres</li></ul>")).toBe("About us\n\n- Go\n- Postgres");
    expect(htmlText("&lt;p&gt;Caf&amp;eacute; &amp;amp; code&lt;/p&gt;")).toBe("Café & code");
  });
});

describe("readBoard", () => {
  it("reads Greenhouse's jobs with their content", async () => {
    const requests = stubFetch(() =>
      json({ jobs: [{ id: 42, title: "Backend Engineer", absolute_url: "https://job-boards.greenhouse.io/alan/jobs/42", location: { name: "Paris or Remote" }, departments: [{ name: "Tech" }], content: "&lt;p&gt;Build things&lt;/p&gt;", first_published: "2026-11-01T10:00:00Z" }] }),
    );
    const [job] = await readBoard({ ats: "greenhouse", slug: "alan" });
    expect(requests[0].url.href).toBe("https://boards-api.greenhouse.io/v1/boards/alan/jobs?content=true");
    expect(job).toEqual({
      id: "42",
      title: "Backend Engineer",
      place: "Paris or Remote",
      remote: true,
      department: "Tech",
      url: "https://job-boards.greenhouse.io/alan/jobs/42",
      description: "Build things",
      complete: true,
      postedAt: "2026-11-01T10:00:00.000Z",
    });
  });

  it("reads Lever's postings, from its EU instance for an EU board", async () => {
    const requests = stubFetch(() =>
      json([
        {
          id: "abc",
          text: "Data Engineer",
          hostedUrl: "https://jobs.eu.lever.co/qonto/abc",
          categories: { location: "Paris", team: "Data", commitment: "CDI" },
          workplaceType: "hybrid",
          createdAt: 1_793_000_000_000,
          descriptionPlain: "Join us.",
          lists: [{ text: "What you'll do", content: "<li>Pipelines</li>" }],
          additionalPlain: "",
        },
      ]),
    );
    const [job] = await readBoard({ ats: "lever_eu", slug: "qonto" });
    expect(requests[0].url.href).toBe("https://api.eu.lever.co/v0/postings/qonto?mode=json");
    expect(job).toMatchObject({ id: "abc", title: "Data Engineer", place: "Paris", remote: null, department: "Data", complete: true });
    expect(job.description).toBe("Join us.\n\nWhat you'll do\n- Pipelines\n\nCommitment: CDI");
  });

  it("reads Ashby's listed jobs only", async () => {
    stubFetch(() =>
      json({
        jobs: [
          { id: "1", title: "ML Engineer", location: "Paris", isRemote: false, isListed: true, jobUrl: "https://jobs.ashbyhq.com/mistral/1", descriptionPlain: "Train models", compensation: { compensationTierSummary: "€80K – €120K" } },
          { id: "2", title: "Hidden", isListed: false },
        ],
      }),
    );
    const jobs = await readBoard({ ats: "ashby", slug: "mistral" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: "ML Engineer", remote: false, description: "Train models\n\nCompensation: €80K – €120K" });
  });

  it("reads Recruitee's published offers and Workable's jobs", async () => {
    stubFetch((request) =>
      request.url.hostname.endsWith("recruitee.com")
        ? json({ offers: [{ id: 7, title: "Product Designer", status: "published", careers_url: "https://acme.recruitee.com/o/designer", location: "Lyon", description: "<p>Design</p>", requirements: "<p>Figma</p>" }] })
        : json({ jobs: [{ shortcode: "AB12", title: "SRE", url: "https://apply.workable.com/acme/j/AB12/", city: "Nantes", country: "France", telecommuting: true, description: "<p>Keep it up</p>" }] }),
    );
    expect((await readBoard({ ats: "recruitee", slug: "acme" }))[0]).toMatchObject({ id: "7", place: "Lyon", description: "Design\n\nRequirements\nFigma" });
    expect((await readBoard({ ats: "workable", slug: "acme" }))[0]).toMatchObject({ id: "AB12", place: "Nantes, France", remote: true, description: "Keep it up" });
  });

  it("marks SmartRecruiters' jobs incomplete, its list having no descriptions", async () => {
    stubFetch(() => json({ content: [{ id: "744", name: "QA Engineer", location: { city: "Montpellier", country: "fr", remote: false } }] }));
    expect((await readBoard({ ats: "smartrecruiters", slug: "Ubisoft2" }))[0]).toMatchObject({
      id: "744",
      url: "https://jobs.smartrecruiters.com/Ubisoft2/744",
      complete: false,
      description: "",
    });
  });

  it("says why a board can't be read", async () => {
    stubFetch(() => json({}, { status: 404 }));
    await expect(readBoard({ ats: "lever", slug: "gone" })).rejects.toThrow("answered with an error (404)");
  });
});

describe("parseBoardKey", () => {
  it("reads back a kept board, and nothing else", () => {
    expect(parseBoardKey("lever:strapi")).toEqual({ ats: "lever", slug: "strapi" });
    expect(parseBoardKey("")).toBeNull();
    expect(parseBoardKey("monster:acme")).toBeNull();
  });
});
