import { describe, expect, it } from "vitest";

import { fitsEmploymentType, fitsSalary, matchesExclusion, parseSalaryRange } from "./posting-filters";

describe("posting-filters", () => {
  describe("parseSalaryRange", () => {
    it("parses annual salary ranges and k notation", () => {
      expect(parseSalaryRange("$120,000–$140,000")).toEqual({ min: 120000, max: 140000 });
      expect(parseSalaryRange("€75k - €90k")).toEqual({ min: 75000, max: 90000 });
      expect(parseSalaryRange("£60,000 a year")).toEqual({ min: 60000, max: 60000 });
    });

    it("converts hourly and monthly salaries to annual equivalents", () => {
      expect(parseSalaryRange("$50/hr")).toEqual({ min: 100000, max: 100000 });
      expect(parseSalaryRange("€5,000 a month")).toEqual({ min: 60000, max: 60000 });
    });

    it("returns null for empty or non-numeric strings", () => {
      expect(parseSalaryRange("")).toBeNull();
      expect(parseSalaryRange("Competitive salary")).toBeNull();
      expect(parseSalaryRange(null)).toBeNull();
    });
  });

  describe("fitsSalary", () => {
    it("filters postings below minimum salary floor", () => {
      expect(fitsSalary({ salary: "€60,000–€70,000" }, { minSalary: 80000 })).toBe(false);
      expect(fitsSalary({ salary: "€80,000–€95,000" }, { minSalary: 80000 })).toBe(true);
      expect(fitsSalary({ salary: "" }, { minSalary: 80000 })).toBe(true); // unspecified pay allowed unless requireSalary is true
    });

    it("enforces required salary disclosure when enabled", () => {
      expect(fitsSalary({ salary: "" }, { requireSalary: true })).toBe(false);
      expect(fitsSalary({ salary: "Competitive" }, { requireSalary: true })).toBe(false);
      expect(fitsSalary({ salary: "$100k" }, { requireSalary: true })).toBe(true);
    });
  });

  describe("matchesExclusion", () => {
    it("excludes postings by company name", () => {
      const posting = { title: "Software Engineer", company: "CyberCoders", description: "Remote role" };
      expect(matchesExclusion(posting, { excludeCompanies: "Revature, CyberCoders" })).toBe(true);
      expect(matchesExclusion(posting, { excludeCompanies: "Acme Corp" })).toBe(false);
    });

    it("excludes postings by keywords in title or description", () => {
      const posting = { title: "Senior PHP Developer", company: "Tech Inc", description: "Needs polygraph clearance" };
      expect(matchesExclusion(posting, { excludeKeywords: "clearance, unpaid" })).toBe(true);
      expect(matchesExclusion(posting, { excludeKeywords: "python, react" })).toBe(false);
    });
  });

  describe("fitsEmploymentType", () => {
    it("filters out internships when looking for full-time", () => {
      expect(fitsEmploymentType({ title: "Design Intern" }, { employmentType: "fulltime" })).toBe(false);
      expect(fitsEmploymentType({ title: "Full-time Designer" }, { employmentType: "fulltime" })).toBe(true);
    });

    it("matches contract and internship postings", () => {
      expect(fitsEmploymentType({ title: "Frontend Contractor" }, { employmentType: "contract" })).toBe(true);
      expect(fitsEmploymentType({ title: "Software Engineering Intern" }, { employmentType: "internship" })).toBe(true);
    });
  });
});
