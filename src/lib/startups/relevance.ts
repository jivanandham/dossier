import type { ProfileData } from "@/lib/profile";

import { GENERIC, skillPattern } from "./match";
import { reach, type Place } from "./place";

// How close a startup's open role is to the profile (see jobs.ts), worked
// out in code so every role can be ranked for free before any AI score.

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const words = (text: string) => fold(text).split(/[^a-z0-9+#]+/).filter((word) => word.length >= 2);

/** Words of a job title that say nothing about the work. */
const TITLE_NOISE = new Set([
  "senior", "junior", "sr", "jr", "lead", "principal", "staff", "head", "chief", "the", "and", "for", "with", "of", "in", "at", "to",
  "de", "du", "des", "et", "la", "le", "les", "en", "au", "hf", "fh", "mf", "fm", "mwd", "remote", "hybrid", "full", "time", "part", "contract",
  "cdi", "cdd", "intern", "internship", "stage", "stagiaire", "i", "ii", "iii", "iv", "new", "team", "office",
]);
/** Words that name a kind of job rather than its field. */
const ROLE_NOUNS = new Set(["engineer", "engineering", "developer", "manager", "specialist", "consultant", "analyst", "designer", "officer", "associate", "ingenieur", "developpeur", "responsable", "charge"]);
const INTERNSHIP = /\b(intern|internship|stagiaire|stage|alternance|alternant|apprenti|apprentice|working student|werkstudent)\b/i;

/**
 * How close a role is to the profile, 0–100, worked out in code so every
 * role can be ranked for free: the words of the profile's headline and
 * recent roles in its title, the profile's skills in its title and text,
 * and where it is. Only the closest get an AI score.
 */
export function relevanceOf(job: { title: string; description: string; place: string; remote: boolean | null }, profile: Pick<ProfileData, "basics" | "skills" | "experience">, place: Place): number {
  const targets = new Set(
    [profile.basics.headline, ...profile.experience.slice(0, 3).map((role) => role.role)].flatMap(words).filter((word) => !TITLE_NOISE.has(word)),
  );
  const title = words(job.title).filter((word) => !TITLE_NOISE.has(word));
  // "Data", "backend", "product" say what the work is; "engineer" or "manager" alone hardly do.
  const shared = [...new Set(title.filter((word) => targets.has(word)))];
  let score = Math.min(50, shared.reduce((sum, word) => sum + (ROLE_NOUNS.has(word) ? 10 : 25), 0));

  const skills = profile.skills.map((skill) => skill.name.trim()).filter((name) => name.length > 1 && !GENERIC.test(name));
  const inTitle = skills.filter((skill) => skillPattern(skill).test(job.title)).length;
  const inText = skills.filter((skill) => skillPattern(skill).test(job.description)).length;
  score += Math.min(35, inTitle * 10 + inText * 6);

  const where = reach(`${job.place}${job.remote ? " | Remote" : ""}`, place);
  if (where.here === "city") score += 15;
  else if (where.here === "country") score += 10;
  if (job.remote && where.remoteOpen !== false) score += 10;
  // Somewhere else, on site: hardly a fit, whatever the title.
  if (job.place && !job.remote && !where.here && place.country && where.remoteOpen !== true) score -= 15;

  // An internship for someone with a few roles behind them.
  if (INTERNSHIP.test(job.title) && profile.experience.length >= 2) score -= 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

