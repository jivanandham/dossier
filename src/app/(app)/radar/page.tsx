import type { Metadata } from "next";

import { loadRadarData } from "@/lib/radar/data";

import { RadarScreen } from "./radar-screen";

export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage() {
  const data = await loadRadarData();
  return <RadarScreen data={data} />;
}
