import "server-only";

import { searchStartupJobs, startupJobDetails } from "@/lib/startups/jobs";

import type { JobSourceAdapter } from "./adapter";

// The open roles of the startups on the Startups screen (source STARTUPS),
// read from their job boards by "Find their jobs" there. Searching them only
// reads the database, so Find jobs and the job agent can search them as
// often as they like; the whole of a role that came without its text is
// read from its board or its page when it's needed.

export const startups: JobSourceAdapter<"STARTUPS"> = {
  source: "STARTUPS",
  search: (query, _credentials, next) => searchStartupJobs(query, next),
  details: (posting) => startupJobDetails(posting.externalId),
  // Nothing to connect to: the roles are in the database.
  test: async () => {},
};
