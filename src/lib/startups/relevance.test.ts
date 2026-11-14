import { describe, expect, it } from "vitest";

import { placeOf } from "./place";
import { relevanceOf } from "./relevance";

const profile = {
  basics: { headline: "Data Engineer", summary: "", city: "Lyon", country: "France" },
  skills: [
    { id: "1", name: "Python" },
    { id: "2", name: "Spark" },
    { id: "3", name: "Airflow" },
    { id: "4", name: "Git" },
  ],
  experience: [{ role: "Data Engineer" }, { role: "Software Engineer" }],
} as unknown as Parameters<typeof relevanceOf>[1];
const lyon = placeOf(profile.basics);
const role = (change: Partial<Parameters<typeof relevanceOf>[0]> = {}) => ({ title: "Data Engineer", description: "", place: "Lyon, France", remote: false, ...change });

describe("relevanceOf", () => {
  it("ranks a role like the profile's, in its city, with its skills, near the top", () => {
    expect(relevanceOf(role({ description: "We use Python, Spark and Airflow." }), profile, lyon)).toBeGreaterThanOrEqual(65);
  });

  it("ranks a role with nothing in common low, below the line for an AI score", () => {
    expect(relevanceOf(role({ title: "Account Executive", place: "Lyon" }), profile, lyon)).toBeLessThan(30);
    // Sharing only "engineer" isn't enough either.
    expect(relevanceOf(role({ title: "Sales Engineer", place: "Lyon" }), profile, lyon)).toBeLessThan(30);
  });

  it("counts remote work open to the profile's country, and holds an on-site role elsewhere back", () => {
    const remote = relevanceOf(role({ place: "Remote (Europe)", remote: true }), profile, lyon);
    const elsewhere = relevanceOf(role({ place: "New York, USA" }), profile, lyon);
    expect(remote).toBeGreaterThan(elsewhere);
  });

  it("holds internships back for someone with a few roles behind them", () => {
    expect(relevanceOf(role({ title: "Data Engineer Intern" }), profile, lyon)).toBeLessThan(relevanceOf(role(), profile, lyon));
  });

  it("ignores seniority and generic words in titles", () => {
    expect(relevanceOf(role({ title: "Senior Data Engineer (H/F)" }), profile, lyon)).toBe(relevanceOf(role(), profile, lyon));
  });
});
