import "server-only";

import { StartupStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { ATS_NAMES, boardKey, boardsIn, findBoard, parseBoardKey, type Board } from "@/lib/startups/ats";
import { keepRoles } from "@/lib/startups/jobs";
import { placeOf } from "@/lib/startups/place";

export type TrackCompanyResult = {
  id: string;
  company: string;
  website: string;
  careersUrl: string;
  boardName: string;
  boardUrl: string;
  rolesCount: number;
  isExisting: boolean;
};

/** Normalizes user input into a clean https:// URL. */
export function normalizeCompanyUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("Please enter a careers or company website address.");
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.href;
  } catch {
    throw new Error("Invalid web address. Please provide a valid URL.");
  }
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

/**
 * Infers company name and official website from the career URL and any detected board slug.
 */
export function inferCompanyDetails(
  url: string,
  explicitName?: string,
  detectedBoard?: Board | null,
): { company: string; domain: string; website: string } {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^(?:www|jobs|careers|apply|boards|job-boards)\./i, "");
  const domain = host;
  const website = `https://${domain}`;

  if (explicitName && explicitName.trim()) {
    return { company: explicitName.trim(), domain, website };
  }

  if (detectedBoard?.slug) {
    const cleanSlug = detectedBoard.slug.replace(/[-_.]+/g, " ").trim();
    if (cleanSlug.length >= 2) {
      return {
        company: titleCase(cleanSlug),
        domain,
        website,
      };
    }
  }

  const namePart = host.split(".")[0] || "Company";
  const company = titleCase(namePart.replace(/[-_]+/g, " "));

  return { company, domain, website };
}

/**
 * Detects the ATS board from the provided URL, either by URL pattern matching or by crawling the page.
 */
export async function detectBoardFromUrl(url: string, company: string, domain: string): Promise<Board | null> {
  const immediate = boardsIn(url, company, domain);
  if (immediate.length > 0) return immediate[0];

  return findBoard({
    company,
    website: url,
    details: "",
    links: [{ label: "Careers", url }],
  });
}

/**
 * Adds or tracks a company in Radar by its careers URL.
 * - Detects its job board (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, WTTJ).
 * - Saves it permanently with status SAVED (so it's immune from automatic sweep).
 * - Immediately fetches its open roles and indexes them.
 */
export async function trackCompanyInRadar({
  url: rawUrl,
  name: explicitName,
  now = new Date(),
}: {
  url: string;
  name?: string;
  now?: Date;
}): Promise<TrackCompanyResult> {
  const careersUrl = normalizeCompanyUrl(rawUrl);
  const tempParsed = new URL(careersUrl);
  const tempDomain = tempParsed.hostname.replace(/^(?:www|jobs|careers|apply|boards|job-boards)\./i, "");

  const board = await detectBoardFromUrl(careersUrl, explicitName ?? "", tempDomain);
  const { company, website } = inferCompanyDetails(careersUrl, explicitName, board);

  // Check if an existing company already matches (by board or by name/domain)
  let existingId: string | null = null;
  if (board) {
    const existingWithBoard = await prisma.startupBoard.findFirst({
      where: { board: boardKey(board) },
      select: { startupId: true },
    });
    if (existingWithBoard) existingId = existingWithBoard.startupId;
  }

  if (!existingId) {
    const existingWithDomain = await prisma.startup.findFirst({
      where: {
        OR: [
          { company: { equals: company, mode: "insensitive" } },
          { website: { contains: tempDomain, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (existingWithDomain) existingId = existingWithDomain.id;
  }

  const externalId = `radar:${board ? boardKey(board) : tempDomain}`.slice(0, 200);

  const startup = existingId
    ? await prisma.startup.update({
        where: { id: existingId },
        data: {
          status: StartupStatus.SAVED,
          seenAt: now,
          links: [{ label: "Careers", url: careersUrl }],
        },
      })
    : await prisma.startup.upsert({
        where: {
          source_externalId: { source: "RADAR", externalId },
        },
        create: {
          source: "RADAR",
          externalId,
          company,
          website,
          summary: `Tracked in Radar (${board ? ATS_NAMES[board.ats] : "Careers site"})`,
          details: `Careers: ${careersUrl}`,
          location: "Remote / France / Europe",
          remote: true,
          stage: "Tracked",
          status: StartupStatus.SAVED,
          links: [{ label: "Careers", url: careersUrl }],
          roles: [],
          emails: [],
          reasons: ["Tracked in Radar for daily job board checking"],
          score: 95,
          seenAt: now,
        },
        update: {
          company,
          website,
          details: `Careers: ${careersUrl}`,
          status: StartupStatus.SAVED,
          links: [{ label: "Careers", url: careersUrl }],
          seenAt: now,
        },
      });

  let rolesCount = 0;
  if (board) {
    const key = boardKey(board);
    await prisma.startupBoard.upsert({
      where: { startupId: startup.id },
      create: {
        startupId: startup.id,
        board: key,
        error: "",
        checkedAt: now,
      },
      update: {
        board: key,
        error: "",
        checkedAt: now,
      },
    });

    const profile = await loadProfile();
    const place = placeOf(profile.basics);
    const controller = new AbortController();
    const result = await keepRoles(startup.id, board, profile, place, now, controller.signal);
    rolesCount = result.listed;
  }

  return {
    id: startup.id,
    company: startup.company,
    website: startup.website,
    careersUrl,
    boardName: board ? ATS_NAMES[board.ats] : "",
    boardUrl: board ? careersUrl : "",
    rolesCount,
    isExisting: Boolean(existingId),
  };
}

/**
 * Removes a company from Radar tracking.
 */
export async function untrackCompanyFromRadar(id: string): Promise<boolean> {
  const startup = await prisma.startup.findUnique({
    where: { id },
    select: { id: true, source: true },
  });
  if (!startup) return false;

  if (startup.source === "RADAR") {
    await prisma.startup.delete({ where: { id } });
  } else {
    // For YC / HN startups, revert status to NEW
    await prisma.startup.update({ where: { id }, data: { status: StartupStatus.NEW } });
  }
  return true;
}
