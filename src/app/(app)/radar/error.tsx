"use client";

import { ScreenError, type ErrorPageProps } from "@/components/screen-error";

export default function RadarError(props: ErrorPageProps) {
  return <ScreenError {...props} title="Radar didn't load" />;
}
