"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { trackCompanyInRadar, untrackCompanyFromRadar } from "@/lib/radar/track";
import { startStartupJobs } from "@/lib/startups/jobs";

const trackSchema = z.object({
  url: z.string().min(3).max(2000),
  name: z.string().max(200).optional(),
});

export const trackCompanyAction = action(trackSchema, async ({ url, name }) => {
  try {
    const result = await trackCompanyInRadar({ url, name });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't track company.";
    throw new ActionError(message);
  }
});

export const untrackCompanyAction = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const ok = await untrackCompanyFromRadar(id);
  if (!ok) throw new ActionError("Company not found or already removed.");
  return { ok: true };
});

export const refreshRadarJobsAction = action(z.object({}), async () => {
  const jobId = await startStartupJobs();
  return { jobId };
});
