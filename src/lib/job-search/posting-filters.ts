import { experienceAskedFor, type ExperienceLevel, type SearchQuery } from "./search";
import { fitsExperience } from "./experience";

/**
 * Parses numeric salary range from a salary string (e.g. "$120,000–$140,000", "€75k - €90k", "$60/hr").
 * Normalizes hourly rates (~2,000 hours/yr) and monthly rates (12 months/yr) to annual figures.
 */
export function parseSalaryRange(salaryStr: string | null | undefined): { min: number | null; max: number | null } | null {
  if (!salaryStr || !salaryStr.trim()) return null;
  const isHourly = /\b(hour|hr|stunde|heure|hora)\b/i.test(salaryStr);
  const isMonthly = /\b(month|monat|mois|mes)\b/i.test(salaryStr);
  const multiplier = isHourly ? 2000 : isMonthly ? 12 : 1;

  const matches = [...salaryStr.matchAll(/(\d[\d,\.]*)\s*(k)?\b/gi)];
  if (!matches.length) return null;

  const numbers: number[] = [];
  for (const match of matches) {
    const rawDigits = match[1].replace(/,/g, "");
    const numVal = parseFloat(rawDigits);
    if (isNaN(numVal) || numVal <= 0) continue;
    let finalVal = numVal;
    if (match[2] && match[2].toLowerCase() === "k") {
      finalVal = numVal * 1000;
    } else if (isHourly && finalVal < 500) {
      finalVal = finalVal * multiplier;
    } else if (isMonthly && finalVal < 20000) {
      finalVal = finalVal * multiplier;
    }
    numbers.push(finalVal);
  }

  if (!numbers.length) return null;
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

/**
 * Checks whether a posting satisfies salary requirements (minimum salary floor and/or disclosed salary requirement).
 */
export function fitsSalary(
  posting: { salary: string },
  options: { minSalary?: number | null; requireSalary?: boolean },
): boolean {
  const range = parseSalaryRange(posting.salary);
  if (options.requireSalary) {
    if (!range) return false;
  }
  if (options.minSalary && options.minSalary > 0) {
    if (range && range.max !== null && range.max < options.minSalary) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if the posting matches negative keywords or excluded companies.
 */
export function matchesExclusion(
  posting: { title: string; company: string; description?: string },
  exclusions: { excludeKeywords?: string | null; excludeCompanies?: string | null },
): boolean {
  if (exclusions.excludeCompanies) {
    const companies = exclusions.excludeCompanies
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const company = (posting.company || "").toLowerCase();
    if (companies.some((excluded) => company.includes(excluded))) {
      return true;
    }
  }
  if (exclusions.excludeKeywords) {
    const keywords = exclusions.excludeKeywords
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const title = (posting.title || "").toLowerCase();
    const desc = (posting.description || "").toLowerCase();
    if (keywords.some((kw) => title.includes(kw) || desc.includes(kw))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a posting fits requested employment type (fulltime, parttime, contract, internship).
 */
export function fitsEmploymentType(
  posting: { title: string; description?: string },
  query: Pick<SearchQuery, "employmentType">,
): boolean {
  const asked = query.employmentType;
  if (!asked || asked === "any") return true;

  const text = `${posting.title} ${posting.description ?? ""}`.toLowerCase();

  if (asked === "internship") {
    if (/\b(intern|internship|praktikum|werkstudent|stage|trainee)\b/i.test(text)) return true;
    if (/\b(senior|lead|principal|staff|director|head of)\b/i.test(posting.title)) return false;
    return false;
  }

  if (asked === "parttime") {
    if (/\b(part[-\s]?time|teilzeit|temps partiel|medio tiempo)\b/i.test(text)) return true;
    if (/\b(full[-\s]?time|vollzeit)\b/i.test(posting.title) && !/\b(part[-\s]?time|teilzeit)\b/i.test(posting.title)) return false;
    return true;
  }

  if (asked === "contract") {
    if (/\b(contract|contractor|freelance|freelancer|consultant|temp\b|befristet)\b/i.test(text)) return true;
    if (/\b(permanent|cdi|festanstellung)\b/i.test(posting.title)) return false;
    return true;
  }

  if (asked === "fulltime") {
    if (/\b(internship|praktikum|intern\b)\b/i.test(posting.title)) return false;
    if (/\b(part[-\s]?time|teilzeit)\b/i.test(posting.title) && !/\b(full[-\s]?time|vollzeit)\b/i.test(posting.title)) return false;
    return true;
  }

  return true;
}
