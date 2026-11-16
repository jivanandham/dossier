import { beforeEach, describe, expect, it, vi } from "vitest";

import { StartupStatus } from "@/generated/prisma/enums";

import {
  detectBoardFromUrl,
  inferCompanyDetails,
  normalizeCompanyUrl,
  trackCompanyInRadar,
  untrackCompanyFromRadar,
} from "./track";

const prisma = vi.hoisted(() => ({
  startup: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  startupBoard: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/profile-data", () => ({
  loadProfile: async () => ({
    basics: { headline: "Software Engineer", summary: "", city: "Paris", country: "France" },
    skills: [{ id: "1", name: "TypeScript" }, { id: "2", name: "Python" }],
    experience: [],
  }),
}));
vi.mock("@/lib/startups/jobs", () => ({
  keepRoles: async () => ({ listed: 5, added: 5 }),
}));

describe("normalizeCompanyUrl", () => {
  it("normalizes bare domain names to https://", () => {
    expect(normalizeCompanyUrl("jobs.lever.co/strapi")).toBe("https://jobs.lever.co/strapi");
    expect(normalizeCompanyUrl("  company.com/careers/  ")).toBe("https://company.com/careers/");
  });

  it("keeps existing https:// protocol", () => {
    expect(normalizeCompanyUrl("https://boards.greenhouse.io/datadog")).toBe("https://boards.greenhouse.io/datadog");
  });

  it("throws on empty or invalid string", () => {
    expect(() => normalizeCompanyUrl("")).toThrow();
    expect(() => normalizeCompanyUrl("   ")).toThrow();
  });
});

describe("inferCompanyDetails", () => {
  it("uses explicit name when provided", () => {
    const details = inferCompanyDetails("https://jobs.lever.co/strapi", "Strapi Headless CMS");
    expect(details.company).toBe("Strapi Headless CMS");
    expect(details.website).toBe("https://lever.co");
  });

  it("infers name from board slug", () => {
    const details = inferCompanyDetails("https://boards.greenhouse.io/datadog", undefined, { ats: "greenhouse", slug: "datadog" });
    expect(details.company).toBe("Datadog");
  });

  it("infers name from hostname", () => {
    const details = inferCompanyDetails("https://careers.qonto.com/openings");
    expect(details.company).toBe("Qonto");
    expect(details.website).toBe("https://qonto.com");
  });
});

describe("detectBoardFromUrl", () => {
  it("detects direct ATS URLs immediately from URL structure", async () => {
    const board = await detectBoardFromUrl("https://jobs.ashbyhq.com/qonto", "Qonto", "qonto.com");
    expect(board).toEqual({ ats: "ashby", slug: "qonto" });
  });

  it("detects Greenhouse, Lever, and WTTJ URLs directly", async () => {
    const gh = await detectBoardFromUrl("https://boards.greenhouse.io/datadog", "Datadog", "datadoghq.com");
    expect(gh).toEqual({ ats: "greenhouse", slug: "datadog" });

    const lever = await detectBoardFromUrl("https://jobs.lever.co/strapi", "Strapi", "strapi.io");
    expect(lever).toEqual({ ats: "lever", slug: "strapi" });

    const wttj = await detectBoardFromUrl("https://www.welcometothejungle.com/fr/companies/alan", "Alan", "alan.com");
    expect(wttj).toEqual({ ats: "wttj", slug: "alan" });
  });
});

describe("trackCompanyInRadar and untrackCompanyFromRadar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a company to radar, creates a board entry, and fetches roles", async () => {
    prisma.startupBoard.findFirst.mockResolvedValueOnce(null);
    prisma.startup.findFirst.mockResolvedValueOnce(null);
    prisma.startup.upsert.mockResolvedValueOnce({
      id: "startup-123",
      company: "Strapi",
      website: "https://lever.co",
      status: StartupStatus.SAVED,
    });
    prisma.startupBoard.upsert.mockResolvedValueOnce({});

    const result = await trackCompanyInRadar({
      url: "https://jobs.lever.co/strapi",
    });

    expect(result.company).toBe("Strapi");
    expect(result.boardName).toBe("Lever");
    expect(result.rolesCount).toBe(5);
    expect(prisma.startup.upsert).toHaveBeenCalled();
    expect(prisma.startupBoard.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { startupId: "startup-123" },
        create: expect.objectContaining({ board: "lever:strapi" }),
      }),
    );
  });

  it("untracks a RADAR-originated company by deleting it", async () => {
    prisma.startup.findUnique.mockResolvedValueOnce({ id: "startup-123", source: "RADAR" });
    prisma.startup.delete.mockResolvedValueOnce({});

    const success = await untrackCompanyFromRadar("startup-123");
    expect(success).toBe(true);
    expect(prisma.startup.delete).toHaveBeenCalledWith({ where: { id: "startup-123" } });
  });
});
