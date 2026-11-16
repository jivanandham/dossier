"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { AiModelSelector } from "@/components/ai-model-selector";
import type { AiProvider } from "@/generated/prisma/enums";
import { useJob } from "@/hooks/use-job";
import { getDefaultModelForProvider } from "@/lib/ai/models";
import { PROVIDER_OPTIONS, providerOption } from "@/lib/ai/provider-options";
import type { WritableKind } from "@/lib/jobs/write-document";

import { startWritingDocument } from "./actions";

const NAMES: Record<WritableKind, string> = { RESUME: "tailored resume", COVER_LETTER: "cover letter" };

/**
 * In place of a document the application was created without (#367): it
 * says so, and writes it on request, in the background. A reloaded page
 * picks up a document still being written.
 */
export function WriteMissingDocument({
  applicationId,
  kind,
  aiReady,
  writing,
  provider,
  defaultModel,
}: {
  applicationId: string;
  kind: WritableKind;
  aiReady: boolean;
  /** The job writing it, e.g. since before a reload. */
  writing: string | null;
  provider?: AiProvider | null;
  defaultModel?: string | null;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState(writing);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const job = useJob(jobId, 0, (update) => {
    if (update.status === "DONE") router.refresh();
    if (update.status === "FAILED") {
      toast(update.error ?? "Writing it didn't work. Try again.");
      setJobId(null);
    }
  });
  const busy = starting || (jobId !== null && job?.status !== "FAILED");

  const write = () =>
    startTransition(async () => {
      const result = await startWritingDocument({
        id: applicationId,
        kind,
        ...(selectedProvider ? { provider: selectedProvider } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
      });
      if (!result.ok) return toast(result.error);
      setJobId(result.data);
    });

  return (
    <div className="flex flex-1 justify-center overflow-auto bg-canvas px-10 pt-16 pb-16">
      <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
        <p className="text-muted">
          {busy
            ? `${job?.step ?? `Writing the ${NAMES[kind]}`}…`
            : `This application was created without a ${NAMES[kind]}.${aiReady ? "" : " Writing one needs an AI provider, in Settings → AI provider."}`}
        </p>
        {aiReady && (
          <div className="flex flex-col items-center gap-2.5">
            <Button variant="secondary" disabled={busy} onClick={write}>
              {busy ? "Writing…" : `Write the ${NAMES[kind]}`}
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
              <span>Provider:</span>
              <select
                aria-label="AI Provider"
                className="h-7 rounded-control border border-line bg-canvas px-2 text-xs font-medium text-ink focus:outline-none focus:ring-1 focus:ring-ink"
                value={selectedProvider ?? ""}
                onChange={(e) => {
                  const next = e.target.value ? (e.target.value as AiProvider) : null;
                  setSelectedProvider(next);
                  setSelectedModel(getDefaultModelForProvider(next));
                }}
              >
                <option value="">Default ({provider ? providerOption(provider)?.name : "Settings default"})</option>
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <span>Model:</span>
              <AiModelSelector
                size="sm"
                provider={selectedProvider ?? provider}
                defaultModel={defaultModel}
                value={selectedModel}
                onChange={setSelectedModel}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
