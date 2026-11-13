import type { SearchQuery } from "@/lib/job-search/search";

export type RemoteDirectoriesCardProps = {
  query?: Partial<SearchQuery> | null;
  className?: string;
};

export function RemoteDirectoriesCard({ query, className }: RemoteDirectoriesCardProps) {
  const rawKeywords = query?.keywords?.trim() ?? "";
  const q = rawKeywords ? encodeURIComponent(rawKeywords) : "";
  const slug = rawKeywords ? encodeURIComponent(rawKeywords.toLowerCase().replace(/\s+/g, "-")) : "";

  // France Remote Search Links
  const wttjUrl = q
    ? `https://www.welcometothejungle.com/fr/jobs?query=${q}&refinementList%5Bworkplace%5D%5B%5D=full_remote`
    : "https://www.welcometothejungle.com/fr/jobs?refinementList%5Bworkplace%5D%5B%5D=full_remote";
  const letMeStartUrl = "https://letmestart.fr/offres/lieu/remote";
  const remoteFrUrl = q ? `https://remotefr.com/?search=${q}` : "https://remotefr.com/";
  const licorneSocietyUrl = "https://www.licornesociety.com/startup-lists/startup-scale-up-next40-ft120";
  const stationFUrl = "https://jobs.stationf.co/";
  const maltUrl = q ? `https://www.malt.fr/s?q=${q}` : "https://www.malt.fr/";
  const freeWorkUrl = q
    ? `https://www.free-work.com/fr/tech-it/jobs?query=${q}&remote=total`
    : "https://www.free-work.com/fr";

  // Europe & Global Remote Search Links
  const euRemoteJobsUrl = q ? `https://euremotejobs.com/?s=${q}` : "https://euremotejobs.com/";
  const europeanRemoteUrl = "https://europeanremote.com/";
  const remoteWorkEuropeUrl = "https://remoteworkeurope.eu/";
  const wellfoundUrl = "https://wellfound.com/startups/location/france";
  const remoteOkUrl = slug ? `https://remoteok.com/remote-${slug}-jobs` : "https://remoteok.com/remote-europe-jobs";
  const himalayasUrl = q ? `https://himalayas.app/jobs/europe?q=${q}` : "https://himalayas.app/jobs/europe";
  const dealroomUrl = "https://dealroom.co/lists/startups-france/";

  return (
    <div className={`rounded-panel border border-line-card bg-card px-6 py-5 text-sm ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-section">Remote Tech Directories — France & Europe</h3>
        <span className="text-meta text-muted">Verified Remote Job Boards & Ecosystems</span>
      </div>
      <p className="mt-1 text-meta text-muted">
        {rawKeywords
          ? `Search “${rawKeywords}” directly across verified France and European remote job boards:`
          : "High-probability remote search engines, verified EU remote directories, and official scale-up indexes:"}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wider text-muted">France Remote Engines</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-meta">
            <a
              href={wttjUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Welcome to the Jungle with Télétravail total filter applied"
            >
              WTTJ Télétravail total ↗
            </a>
            <a
              href={letMeStartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Let me Start: 340+ remote offers at French startups"
            >
              Let me Start (340+ Remote FR) ↗
            </a>
            <a
              href={remoteFrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="RemoteFR: Dedicated French remote tech job board"
            >
              RemoteFR ↗
            </a>
            <a
              href={licorneSocietyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Licorne Society: 50+ Full Remote Startups Index"
            >
              Licorne Society Full Remote ↗
            </a>
            <a
              href={stationFUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Station F: Official job board for 1000+ campus startups"
            >
              Station F Jobs ↗
            </a>
            <a
              href={maltUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Malt: Leading French tech freelance marketplace"
            >
              Malt (Tech Freelance) ↗
            </a>
            <a
              href={freeWorkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Free-Work: IT contract and CDI remote positions in France"
            >
              Free-Work (Contract/CDI) ↗
            </a>
          </div>
        </div>

        <div>
          <p className="text-caption font-semibold uppercase tracking-wider text-muted">Europe & Global Remote</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-meta">
            <a
              href={euRemoteJobsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="EU Remote Jobs: Focuses on country-level location eligibility across Europe"
            >
              EU Remote Jobs ↗
            </a>
            <a
              href={europeanRemoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="European Remote: 220+ verified remote-friendly European companies"
            >
              European Remote (220+ Firms) ↗
            </a>
            <a
              href={remoteWorkEuropeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Remote Work Europe: Detailed policy breakdowns"
            >
              Remote Work Europe ↗
            </a>
            <a
              href={wellfoundUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Wellfound: European startups with remote work options"
            >
              Wellfound Remote ↗
            </a>
            <a
              href={remoteOkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Remote OK Europe: Filtered by Europe time zones"
            >
              Remote OK (Europe) ↗
            </a>
            <a
              href={himalayasUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Himalayas: Remote jobs across Europe and EMEA"
            >
              Himalayas Europe ↗
            </a>
            <a
              href={dealroomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-accent"
              title="Dealroom: Leading startup and scaleup database for France and Europe"
            >
              Dealroom Scaleups ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
