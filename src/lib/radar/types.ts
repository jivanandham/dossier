// Radar types: Market intelligence, Live ATS job stream, and Remote Policy Directory (#222 follow-up)

export type RadarTab = "roles" | "policies" | "ecosystem" | "intelligence";

export type RemotePolicyTier = "FULLY_REMOTE" | "REMOTE_FRANCE" | "HYBRID";

export type RadarJobItem = {
  externalId: string;
  startupId: string;
  company: string;
  companyWebsite: string;
  title: string;
  department: string;
  place: string;
  remote: boolean | null;
  url: string;
  postedAt: string | null;
  relevance: number;
  score: number | null;
  scoreReasons: string[];
  boardName: string;
  applicationId: string | null;
  dismissed: boolean;
};

export type RadarCompanyItem = {
  id: string;
  name: string;
  policyTier: RemotePolicyTier;
  policyLabel: string;
  policyDescription: string;
  location: string;
  website: string;
  careersUrl: string;
  boardName: string;
  boardUrl: string;
  jobCount: number;
  keyRoles: string[];
  tracked?: boolean;
  source?: string;
};

export type RadarEcosystemItem = {
  name: string;
  region: "France" | "Europe & Global";
  url: string;
  searchUrl?: string;
  tag: string;
  description: string;
};

export type RadarStats = {
  totalCompanies: number;
  activeBoards: number;
  totalRoles: number;
  remoteRoles: number;
  franceRoles: number;
  scoredRoles: number;
  topHiringCompanies: { company: string; count: number }[];
};

export type RadarData = {
  jobs: RadarJobItem[];
  companies: RadarCompanyItem[];
  ecosystems: RadarEcosystemItem[];
  stats: RadarStats;
  today: string;
};
