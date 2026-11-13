import { AiProvider } from "@/generated/prisma/enums";

/** Popular known models for each provider when offline or before live list loads. */
export const KNOWN_PROVIDER_MODELS: Record<AiProvider, readonly string[]> = {
  [AiProvider.GOOGLE]: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  [AiProvider.ANTHROPIC]: [
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    "claude-opus-5-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  [AiProvider.OPENAI]: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "o1",
    "o1-mini",
  ],
  [AiProvider.MISTRAL]: [
    "mistral-small-latest",
    "mistral-medium-latest",
    "mistral-large-latest",
    "codestral-latest",
  ],
  [AiProvider.NEURALWATT]: [
    "neuralwatt-fast",
    "qwen-3.8-27b",
  ],
  [AiProvider.LMSTUDIO]: [],
  [AiProvider.LOCAL]: [
    "llama3.1:8b",
    "llama3.2:3b",
    "qwen2.5:7b",
  ],
};

/** Returns the recommended default model for a given provider. */
export function getDefaultModelForProvider(provider: AiProvider | null | undefined): string | null {
  if (!provider) return null;
  return KNOWN_PROVIDER_MODELS[provider]?.[0] ?? null;
}

/** Merges known fallback models with the currently configured model. */
export function getKnownModelsForProvider(provider: AiProvider | null | undefined, currentModel?: string | null): string[] {
  if (!provider) return currentModel ? [currentModel] : [];
  const list = [...(KNOWN_PROVIDER_MODELS[provider] ?? [])];
  if (currentModel && !list.includes(currentModel)) {
    list.unshift(currentModel);
  }
  return list;
}
