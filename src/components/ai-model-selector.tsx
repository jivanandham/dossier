"use client";

import { useEffect, useState } from "react";

import { listAiModels } from "@/app/(app)/settings/actions";
import type { AiProvider } from "@/generated/prisma/enums";
import { getKnownModelsForProvider } from "@/lib/ai/models";
import { cn } from "@/lib/cn";

export function AiModelSelector({
  provider,
  defaultModel,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel = "AI Model",
}: {
  provider: AiProvider | null | undefined;
  defaultModel?: string | null;
  value: string | null;
  onChange: (model: string | null) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const [models, setModels] = useState<string[]>(() => getKnownModelsForProvider(provider, defaultModel));
  const [isCustom, setIsCustom] = useState(() => Boolean(value && !models.includes(value)));

  useEffect(() => {
    const known = getKnownModelsForProvider(provider, defaultModel);
    setModels(known);
    setIsCustom(Boolean(value && !known.includes(value)));

    let active = true;
    void listAiModels({ provider: provider ?? undefined })
      .then((result) => {
        if (!active || !result?.ok || !result.data?.models?.length) return;
        setModels((current) => {
          const set = new Set([...known, ...result.data.models]);
          return Array.from(set);
        });
      })
      .catch(() => {
        // Silently catch errors in environments like test runner without request cookies
      });
    return () => {
      active = false;
    };
  }, [provider, defaultModel]);

  const fallback = defaultModel || "Settings default";

  if (isCustom) {
    return (
      <div className={cn("inline-flex items-center gap-1.5", className)}>
        <input
          type="text"
          aria-label={ariaLabel}
          placeholder="Model name…"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value.trim() : null)}
          className={cn(
            "rounded-control border border-line bg-canvas px-2 text-ink focus:outline-none focus:ring-1 focus:ring-ink",
            size === "sm" ? "h-7 text-xs" : "h-9 text-sm px-3",
          )}
        />
        <button
          type="button"
          onClick={() => {
            setIsCustom(false);
            onChange(null);
          }}
          className="text-xs text-muted underline hover:text-ink"
        >
          Reset
        </button>
      </div>
    );
  }

  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        if (val === "__custom") {
          setIsCustom(true);
          onChange("");
        } else {
          onChange(val ? val : null);
        }
      }}
      className={cn(
        "rounded-control border border-line bg-canvas font-medium text-ink focus:outline-none focus:ring-1 focus:ring-ink",
        size === "sm" ? "h-7 px-2 py-0.5 text-xs" : "h-9 px-3 py-1.5 text-sm",
        className,
      )}
    >
      <option value="">Default ({fallback})</option>
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      <option value="__custom">Custom model…</option>
    </select>
  );
}
