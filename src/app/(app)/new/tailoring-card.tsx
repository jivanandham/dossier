"use client";

import { useId } from "react";

import { AiModelSelector } from "@/components/ai-model-selector";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import type { AiProvider } from "@/generated/prisma/enums";
import { Tone } from "@/generated/prisma/enums";
import { PROVIDER_OPTIONS, providerOption } from "@/lib/ai/provider-options";
import { DOCUMENTS_TO_WRITE, type DocumentsToWrite } from "@/lib/settings";
import { TONES } from "@/lib/tones";

const TONE_OPTIONS = Object.values(Tone).map((tone) => ({ value: tone, label: TONES[tone].label }));
const WRITE_LABELS: Record<DocumentsToWrite, string> = { both: "Resume and letter", resume: "Resume", letter: "Cover letter" };
const WRITE_OPTIONS = DOCUMENTS_TO_WRITE.map((value) => ({ value, label: WRITE_LABELS[value] }));

/** "Tailoring" (E7-5, NEW-6): what to write (#367), the cover letter's tone, and a note for the AI. */
export function TailoringCard({
  write,
  tone,
  note,
  model,
  provider,
  selectedProvider,
  defaultModel,
  onWrite,
  onTone,
  onNote,
  onModel,
  onProvider,
}: {
  write: DocumentsToWrite;
  tone: Tone;
  note: string;
  model: string | null;
  provider?: AiProvider | null;
  selectedProvider?: AiProvider | null;
  defaultModel?: string | null;
  onWrite: (write: DocumentsToWrite) => void;
  onTone: (tone: Tone) => void;
  onNote: (note: string) => void;
  onModel: (model: string | null) => void;
  onProvider?: (provider: AiProvider | null) => void;
}) {
  const writeId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const effectiveProvider = selectedProvider ?? provider;
  const defaultProviderName = provider ? providerOption(provider)?.name : "Settings default";

  return (
    <Card className="flex flex-col gap-5 py-6">
      <h2 className="text-[15px] font-medium">Tailoring</h2>
      <div className="flex flex-col gap-[9px]">
        <span className="text-label text-muted">AI Provider & Model</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <select
            aria-label="AI Provider"
            className="h-9 rounded-control border border-line bg-canvas px-3 py-1.5 text-sm font-medium text-ink focus:outline-none focus:ring-1 focus:ring-ink"
            value={selectedProvider ?? ""}
            onChange={(e) => {
              const next = e.target.value ? (e.target.value as AiProvider) : null;
              onProvider?.(next);
            }}
          >
            <option value="">Default ({defaultProviderName})</option>
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.name}
              </option>
            ))}
          </select>
          <AiModelSelector
            provider={effectiveProvider}
            defaultModel={defaultModel}
            value={model}
            onChange={onModel}
          />
          <span className="text-meta text-muted">Provider and model used to tailor your documents for this application.</span>
        </div>
      </div>
      <div className="flex flex-col gap-[9px]">
        <span id={writeId} className="text-label text-muted">
          Write
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SegmentedControl aria-labelledby={writeId} options={WRITE_OPTIONS} value={write} onValueChange={onWrite} />
          {write !== "both" && <span className="text-meta text-muted">The other can be written later, from the application.</span>}
        </div>
      </div>
      {write !== "resume" && (
      <div className="flex flex-col gap-[9px]">
        <span id={labelId} className="text-label text-muted">
          Cover letter tone
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SegmentedControl
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            options={TONE_OPTIONS}
            value={tone}
            onValueChange={onTone}
          />
          <span id={descriptionId} className="text-meta text-muted">
            {TONES[tone].description}
          </span>
        </div>
      </div>
      )}
      <Textarea
        label="Anything I should know?"
        hint="Kept with the application as a fact for the AI. Change it later on its Job posting tab."
        rows={3}
        placeholder="e.g. I'm relocating to Amsterdam in January. Or: lean on my research work."
        value={note}
        onChange={(event) => onNote(event.target.value)}
      />
    </Card>
  );
}
