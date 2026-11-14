import "server-only";

import { jobSearchError } from "./errors";
import type { JobSource } from "./search";

// Requests to job sources (E14-1). Each source has a fixed host, so unlike
// fetching a posting (src/lib/posting-fetch.ts) there's no address to guard;
// requests are still limited in time and size.

export const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

/** GETs JSON from a source, turning every failure into a JobSearchError; `timeoutMs` for a source that needs longer. */
export async function requestJson(
  source: JobSource,
  url: URL,
  { headers = {}, signal, timeoutMs = REQUEST_TIMEOUT_MS }: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
  } catch (error) {
    const reason = timeout.aborted ? "timed out" : ((error as { cause?: { code?: string } }).cause?.code ?? "request failed");
    throw jobSearchError("unavailable", source, { detail: `${url.pathname}: ${reason}` });
  }

  const detail = `${url.pathname}: HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) throw jobSearchError("key", source, { detail });
  if (response.status === 429) throw jobSearchError("quota", source, { detail });
  if (!response.ok) throw jobSearchError(response.status >= 500 ? "unavailable" : "changed", source, { detail });

  const text = await readLimited(response, MAX_BYTES);
  if (text === null) throw jobSearchError("changed", source, { detail: `${url.pathname}: answer over ${MAX_BYTES} bytes` });
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw jobSearchError("changed", source, { detail: `${url.pathname}: not JSON` });
  }
}

/** An answer from a source with its status and headers, for sources that page with headers or answer 204. */
export type SourceResponse = { status: number; headers: Headers; body: unknown };

/**
 * Like requestJson, for sources that need more than a GET: another method
 * and body, the status and headers back (France Travail pages with
 * Content-Range), and 204 No Content as a null body. `keyStatuses` are the
 * statuses that mean a refused key (an OAuth token endpoint answers 400).
 */
export async function requestSource(
  source: JobSource,
  url: URL,
  {
    method = "GET",
    headers = {},
    body,
    signal,
    timeoutMs = REQUEST_TIMEOUT_MS,
    keyStatuses = [401, 403],
    maxBytes = MAX_BYTES,
  }: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: URLSearchParams | string;
    signal?: AbortSignal;
    timeoutMs?: number;
    keyStatuses?: readonly number[];
    /** For reference lists bigger than a page of results. */
    maxBytes?: number;
  } = {},
): Promise<SourceResponse> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { accept: "application/json", ...headers },
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
  } catch (error) {
    const reason = timeout.aborted ? "timed out" : ((error as { cause?: { code?: string } }).cause?.code ?? "request failed");
    throw jobSearchError("unavailable", source, { detail: `${url.pathname}: ${reason}` });
  }

  const detail = `${url.pathname}: HTTP ${response.status}`;
  if (keyStatuses.includes(response.status)) throw jobSearchError("key", source, { detail });
  if (response.status === 429) throw jobSearchError("quota", source, { detail });
  if (!response.ok) throw jobSearchError(response.status >= 500 ? "unavailable" : "changed", source, { detail });
  if (response.status === 204) return { status: 204, headers: response.headers, body: null };

  const text = await readLimited(response, maxBytes);
  if (text === null) throw jobSearchError("changed", source, { detail: `${url.pathname}: answer over ${maxBytes} bytes` });
  if (text.trim() === "") return { status: response.status, headers: response.headers, body: null };
  try {
    return { status: response.status, headers: response.headers, body: JSON.parse(text) as unknown };
  } catch {
    throw jobSearchError("changed", source, { detail: `${url.pathname}: not JSON` });
  }
}

/** The body as text, or null when it's bigger than `limit` bytes. */
async function readLimited(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
