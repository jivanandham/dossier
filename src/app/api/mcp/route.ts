import { createMcpHandler } from "@modelcontextprotocol/server";

import { connectorSince, mcpUrl, SCOPE, verifyAccessToken } from "@/lib/connector/oauth";
import { createDossierServer } from "@/lib/connector/tools";
import { publicOrigin } from "@/lib/google/origin";
import { logServerError } from "@/lib/log";

// The Claude connector (#221): Dossier as a remote MCP server (Streamable
// HTTP) at /api/mcp, for Claude's custom connectors. Each request gets a
// server of its own, without an MCP session, for the 2025 protocol Claude
// speaks today and the 2026-07-28 one. It answers 404 while the connector is
// off in Settings, and needs an access token from Dossier's own sign-in
// (src/lib/connector/oauth.ts); the proxy lets it through without a session.

// The address links in answers point to comes along with the token's details.
const handler = createMcpHandler(({ authInfo }) => createDossierServer(typeof authInfo?.extra?.origin === "string" ? authInfo.extra.origin : ""), {
  onerror: (error) => logServerError("MCP connector", error),
});

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS, DELETE",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, accept",
  "access-control-expose-headers": "www-authenticate, mcp-protocol-version",
};

/** "Sign in first", with where the app finds out how (RFC 9728). Any MCP app gets it, not only Claude (#281). */
function unauthorized(origin: string): Response {
  return Response.json(
    { error: "invalid_token", error_description: "Connect this app to Dossier first." },
    {
      status: 401,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp", scope="${SCOPE}"`,
        ...CORS_HEADERS,
      },
    },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return OPTIONS();
  if (!(await connectorSince())) return new Response(null, { status: 404, headers: CORS_HEADERS });
  const origin = publicOrigin(request);
  const token = /^Bearer\s+(\S.*)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const access = await verifyAccessToken(token);
  if (!access) return unauthorized(origin);
  try {
    const res = await handler.fetch(request, { authInfo: { token: token!, clientId: access.clientId, scopes: [SCOPE], extra: { origin } } });
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.headers.set(key, value);
    }
    return res;
  } catch (error) {
    logServerError(`MCP connector ${mcpUrl(origin)}`, error);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Dossier couldn't answer that." }, id: null },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
