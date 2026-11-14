import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ connectorEnabledAt: "2026-11-01T00:00:00.000Z", connectorRedirects: [] as string[], connectorRefused: [] as string[] }));
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "s".repeat(40), DOSSIER_PASSWORD: "argon2id:m=19456,t=2,p=1:c2FsdA:aGFzaA" } }));
vi.mock("@/lib/settings-data", () => ({
  loadSettings: async () => settings,
  saveSettings: async (changes: Partial<typeof settings>) => void Object.assign(settings, changes),
}));

import { POST } from "./route";

const GEMINI = "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-123-jeevas-mac-mini_taile5c631_ts_net";
const register = (redirectUris: string[]) =>
  POST(new Request("https://dossier.example/api/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: redirectUris, client_name: "Gemini" }) }));

beforeEach(() => {
  settings.connectorRedirects = [];
  settings.connectorRefused = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("registering an app", () => {
  it("turns away a callback address that isn't added, and keeps it for Settings to offer adding", async () => {
    const response = await register([GEMINI]);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(settings.connectorRefused).toEqual([GEMINI]);
  });

  it("registers the app once its callback address is added", async () => {
    settings.connectorRedirects = [GEMINI];
    const response = await register([GEMINI]);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ client_name: "Gemini", redirect_uris: [GEMINI] });
  });

  it("doesn't keep addresses that could never be added", async () => {
    await register(["http://evil.example/callback"]);
    expect(settings.connectorRefused).toEqual([]);
  });
});
