"use server";

import { z } from "zod";

import { StartupStatus } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { scoreJobKey, scorePostingJob } from "@/lib/jobs/score-posting";
import { dismissPosting, storePosting, unmarkPosting } from "@/lib/postings";
import { scoringProblem } from "@/lib/scoring";
import { startStartupJobs, startupJobPosting } from "@/lib/startups/jobs";
import { startStartupsRefresh } from "@/lib/startups/refresh";
import { lookUpStartup, removeStartup, updateStartup } from "@/lib/startups/store";

// The Startups screen's actions (#222). Nothing here sends anything: the
// user writes to a startup from New application or their own mail.

const startupId = z.string().min(1).max(64);
const GONE = "That startup is no longer in the list. Refresh the page.";

/** "Refresh": asks both sources again, in the background; returns the job to follow. */
export const refreshStartupsNow = action(z.object({}), async () => ({ jobId: await startStartupsRefresh() }));

/** Save, Mark as contacted, Dismiss, and their Undo. */
export const setStartupStatus = action(z.object({ id: startupId, status: z.enum(StartupStatus) }), async ({ id, status }) => {
  const startup = await updateStartup(id, { status });
  if (!startup) throw new ActionError(GONE);
  return { status: startup.status };
});

/**
 * "Find addresses on their site", or with `people`, "Look for people's
 * addresses": reads the startup's own pages for the addresses it publishes.
 */
export const lookUpStartupAddresses = action(z.object({ id: startupId, people: z.boolean() }), async ({ id, people }) => {
  const startup = await lookUpStartup(id, { people });
  if (!startup) throw new ActionError(GONE);
  return startup;
});

/** Notes on a startup, kept as typed. */
export const saveStartupNotes = action(z.object({ id: startupId, notes: z.string().max(5_000) }), async ({ id, notes }) => {
  if (!(await updateStartup(id, { notes }))) throw new ActionError(GONE);
  return null;
});

/** "Remove and don't bring back": deletes it, and refreshes leave it out from now on. */
export const removeStartupForGood = action(z.object({ id: startupId }), async ({ id }, { toast }) => {
  if (!(await removeStartup(id))) throw new ActionError(GONE);
  toast("Removed. Refreshes won't bring it back.");
  return null;
});

// Their open roles, read from their job boards. A role is a posting of
// source STARTUPS, so scoring it and starting an application from it go the
// way they go in Find jobs. The screen sends only the role's id; the posting
// is read on the server.

const roleId = z.string().min(1).max(500);
const ROLE_GONE = "That role is no longer listed on their board. Find their jobs again.";

/** "Find their jobs": reads the best-matching startups' job boards and scores the closest roles, in the background. */
export const findStartupJobsNow = action(z.object({}), async () => ({ jobId: await startStartupJobs() }));

/** "Score" on a role: how well it fits the profile, with the scorer Settings → Scoring chose. */
export const scoreStartupRole = action(z.object({ externalId: roleId }), async ({ externalId }) => {
  const problem = await scoringProblem();
  if (problem) throw new ActionError(problem);
  const posting = await startupJobPosting(externalId);
  if (!posting) throw new ActionError(ROLE_GONE);
  const key = scoreJobKey(posting);
  const [unfinished] = await findUnfinishedJobs(key);
  return { jobId: unfinished?.id ?? (await startJob(scorePostingJob, { posting }, { key })) };
});

/** "Start application" on a role: keeps it as a posting, whole, for New application to open. */
export const startApplicationFromRole = action(z.object({ externalId: roleId }), async ({ externalId }) => {
  const posting = await startupJobPosting(externalId);
  if (!posting) throw new ActionError(ROLE_GONE);
  const stored = await storePosting(posting);
  return { postingId: stored.id };
});

/** "Not for me": out of the card, Find jobs and the agent. Undo brings it back. */
export const dismissStartupRole = action(z.object({ externalId: roleId, undo: z.boolean().optional() }), async ({ externalId, undo }) => {
  const posting = await startupJobPosting(externalId, { whole: false });
  if (!posting) throw new ActionError(ROLE_GONE);
  if (undo) await unmarkPosting(posting, "dismissed");
  else await dismissPosting(posting);
  return null;
});
