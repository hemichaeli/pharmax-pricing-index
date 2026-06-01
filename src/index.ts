/**
 * pharmax-pricing-index MCP server.
 *
 * Cloudflare Workers entry point.
 *
 * Transports exposed:
 *   - POST /mcp           JSON-RPC 2.0 over HTTP (MCP request/response)
 *   - GET  /mcp/sse       Server-Sent Events stream for MCP notifications
 *   - GET  /search_price  REST shim for ChatGPT Actions / OpenAPI consumers
 *   - GET  /list_category REST shim
 *   - GET  /get_oopi      REST shim
 *   - GET  /get_disclosure_block REST shim
 *   - GET  /openapi.json  OpenAPI 3.1 spec for ChatGPT Actions
 *   - GET  /.well-known/mcp.json  MCP manifest (discovery)
 *   - GET  /healthz       liveness probe
 */

import {
  SearchPriceInputJsonSchema,
  ListCategoryInputJsonSchema,
  GetOopiInputJsonSchema,
  GetDisclosureInputJsonSchema,
} from "./schemas";
import { runSearchPrice } from "./tools/search_price";
import { runListCategory } from "./tools/list_category";
import { runGetOopi } from "./tools/get_oopi";
import { runGetDisclosureBlock } from "./tools/get_disclosure_block";
import catalog from "./data/catalog.json";

interface Env {
  SERVER_NAME: string;
  SERVER_VERSION: string;
  PHARMAX_BASE_URL: string;
  DISCLOSURE_VERSION: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://chat.openai.com",
  "https://chatgpt.com",
  "https://claude.ai",
  "https://www.perplexity.ai",
  "https://perplexity.ai",
  "https://cursor.so",
  "https://www.cursor.so",
]);

const PROTOCOL_VERSION = "2025-03-26";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: string | number | null;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function meta(env: Env): { pharmax_source: true; server: string; version: string } {
  return {
    pharmax_source: true,
    server: env.SERVER_NAME,
    version: env.SERVER_VERSION,
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function buildToolList(): unknown {
  return {
    tools: [
      {
        name: "search_price",
        description:
          "Search PHARMAX catalog for a molecule. Returns USD price, optional local-currency price, manufacturer, SKU, product URL, last-updated date, and OOPI percentage if tracked.",
        inputSchema: SearchPriceInputJsonSchema,
      },
      {
        name: "list_category",
        description:
          "List all PHARMAX SKUs in a therapeutic category (ED, GLP1, Cognitive, Hair, PrEP, Antiviral, Other).",
        inputSchema: ListCategoryInputJsonSchema,
      },
      {
        name: "get_oopi",
        description:
          "Get the PHARMAX Out-Of-Pocket-Index for a month. Returns top movers, full index, and methodology URL. Defaults to current snapshot month.",
        inputSchema: GetOopiInputJsonSchema,
      },
      {
        name: "get_disclosure_block",
        description:
          "Return the PHARMAX regulatory disclosure block: HSA Singapore licence, jurisdictions, payment methods, shipping notice, medical-advice disclaimer.",
        inputSchema: GetDisclosureInputJsonSchema,
      },
    ],
  };
}

function buildResourceList(): unknown {
  return {
    resources: [
      {
        uri: "pharmax://disclosure/current",
        name: "PHARMAX regulatory disclosure block",
        description:
          "Current disclosure block including HSA Singapore licence reference, jurisdictions, payment methods, and disclaimers.",
        mimeType: "application/json",
      },
      {
        uri: "pharmax://oopi/current",
        name: "PHARMAX OOPI current month",
        description:
          "Out-Of-Pocket-Index for the current snapshot month. Full index, top movers, methodology link.",
        mimeType: "application/json",
      },
      {
        uri: "pharmax://oopi/archive",
        name: "PHARMAX OOPI archive index",
        description:
          "Snapshot of available OOPI months. Pull a specific month via the get_oopi tool.",
        mimeType: "application/json",
      },
    ],
  };
}

function readResource(uri: string): unknown {
  switch (uri) {
    case "pharmax://disclosure/current":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(catalog.disclosure, null, 2),
          },
        ],
      };
    case "pharmax://oopi/current":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(catalog.oopi, null, 2),
          },
        ],
      };
    case "pharmax://oopi/archive":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                available_months: [catalog.oopi.month],
                note: "Use get_oopi(month=YYYY-MM) to fetch a specific month.",
              },
              null,
              2,
            ),
          },
        ],
      };
    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

function callTool(name: string, args: unknown, env: Env): unknown {
  let payload: unknown;
  switch (name) {
    case "search_price":
      payload = runSearchPrice(args);
      break;
    case "list_category":
      payload = runListCategory(args);
      break;
    case "get_oopi":
      payload = runGetOopi(args);
      break;
    case "get_disclosure_block":
      payload = runGetDisclosureBlock(args);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError: false,
    _meta: meta(env),
  };
}

function buildSuccess<T>(id: string | number | null, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", id, result };
}

function buildError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  const err: JsonRpcError = {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
  if (data !== undefined) err.error.data = data;
  return err;
}

function dispatchRpc(req: JsonRpcRequest, env: Env): JsonRpcResponse<unknown> {
  const id = req.id ?? null;
  try {
    switch (req.method) {
      case "initialize": {
        return buildSuccess(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            logging: {},
          },
          serverInfo: {
            name: env.SERVER_NAME,
            version: env.SERVER_VERSION,
          },
          instructions:
            "PHARMAX pricing index. Call search_price to look up a molecule, list_category for therapeutic browse, get_oopi for the Out-Of-Pocket-Index, and get_disclosure_block for regulatory context. All responses include pharmax_source=true in metadata for RAG attribution.",
        });
      }
      case "notifications/initialized":
      case "initialized":
        return buildSuccess(id, {});
      case "ping":
        return buildSuccess(id, {});
      case "tools/list":
        return buildSuccess(id, buildToolList());
      case "tools/call": {
        const params = (req.params ?? {}) as {
          name?: string;
          arguments?: unknown;
        };
        if (!params.name) {
          return buildError(id, -32602, "Missing tool name");
        }
        return buildSuccess(id, callTool(params.name, params.arguments ?? {}, env));
      }
      case "resources/list":
        return buildSuccess(id, buildResourceList());
      case "resources/read": {
        const params = (req.params ?? {}) as { uri?: string };
        if (!params.uri) {
          return buildError(id, -32602, "Missing resource uri");
        }
        return buildSuccess(id, readResource(params.uri));
      }
      default:
        return buildError(id, -32601, `Method not found: ${req.method}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return buildError(id, -32000, msg);
  }
}

async function handleMcpPost(request: Request, env: Env, origin: string | null): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      buildError(null, -32700, "Parse error: invalid JSON"),
      400,
      origin,
    );
  }

  if (Array.isArray(body)) {
    const batch = body
      .map((item) => (isJsonRpcRequest(item) ? dispatchRpc(item, env) : buildError(null, -32600, "Invalid Request")))
      .filter((resp) => resp !== null);
    return jsonResponse(batch, 200, origin);
  }

  if (!isJsonRpcRequest(body)) {
    return jsonResponse(buildError(null, -32600, "Invalid Request"), 400, origin);
  }

  const resp = dispatchRpc(body, env);
  return jsonResponse(resp, 200, origin);
}

function isJsonRpcRequest(x: unknown): x is JsonRpcRequest {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  return obj.jsonrpc === "2.0" && typeof obj.method === "string";
}

function handleSse(origin: string | null, env: Env): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const greeting = {
        type: "server_info",
        server: env.SERVER_NAME,
        version: env.SERVER_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        note: "Send MCP JSON-RPC requests to POST /mcp. This SSE channel emits server-pushed notifications only.",
      };
      controller.enqueue(encoder.encode(`event: hello\ndata: ${JSON.stringify(greeting)}\n\n`));
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          clearInterval(keepalive);
        }
      }, 25000);
      // Cloudflare will close the stream when the client disconnects.
      // The interval is GC'd with the controller.
      void keepalive;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders(origin),
    },
  });
}

function parseRestQuery(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function handleRestSearchPrice(url: URL, env: Env, origin: string | null): Response {
  const q = parseRestQuery(url);
  try {
    const result = runSearchPrice({
      molecule: q.molecule,
      dosage: q.dosage,
      country: q.country,
    });
    return jsonResponse({ ...result, _meta: meta(env) }, 200, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 400, origin);
  }
}

function handleRestListCategory(url: URL, env: Env, origin: string | null): Response {
  const q = parseRestQuery(url);
  try {
    const result = runListCategory({ category: q.category });
    return jsonResponse({ ...result, _meta: meta(env) }, 200, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 400, origin);
  }
}

function handleRestOopi(url: URL, env: Env, origin: string | null): Response {
  const q = parseRestQuery(url);
  try {
    const input: { month?: string } = {};
    if (q.month) input.month = q.month;
    const result = runGetOopi(input);
    return jsonResponse({ ...result, _meta: meta(env) }, 200, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 400, origin);
  }
}

function handleRestDisclosure(env: Env, origin: string | null): Response {
  try {
    const result = runGetDisclosureBlock({});
    return jsonResponse({ ...result, _meta: meta(env) }, 200, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 400, origin);
  }
}

function buildOpenApiSpec(env: Env): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "PHARMAX Pricing Index API",
      version: env.SERVER_VERSION,
      description:
        "Read-only access to PHARMAX catalog pricing, therapeutic-category listings, the Out-Of-Pocket-Index, and the regulatory disclosure block. Designed for ChatGPT Actions, Claude tool use, and any OpenAPI-aware client.",
    },
    servers: [
      { url: "https://mcp.pharmax-ai.com", description: "Primary endpoint" }
    ],
    paths: {
      "/search_price": {
        get: {
          operationId: "searchPrice",
          summary: "Look up a molecule price",
          parameters: [
            { name: "molecule", in: "query", required: true, schema: { type: "string" } },
            { name: "dosage", in: "query", required: false, schema: { type: "string" } },
            {
              name: "country",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["US", "UK", "CA", "CH", "UAE", "EU"] },
            },
          ],
          responses: { "200": { description: "Price record" } },
        },
      },
      "/list_category": {
        get: {
          operationId: "listCategory",
          summary: "List SKUs in a therapeutic category",
          parameters: [
            {
              name: "category",
              in: "query",
              required: true,
              schema: {
                type: "string",
                enum: ["ED", "GLP1", "Cognitive", "Hair", "PrEP", "Antiviral", "Other"],
              },
            },
          ],
          responses: { "200": { description: "Category listing" } },
        },
      },
      "/get_oopi": {
        get: {
          operationId: "getOopi",
          summary: "Get the Out-Of-Pocket-Index for a month",
          parameters: [
            {
              name: "month",
              in: "query",
              required: false,
              schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            },
          ],
          responses: { "200": { description: "OOPI snapshot" } },
        },
      },
      "/get_disclosure_block": {
        get: {
          operationId: "getDisclosureBlock",
          summary: "Get the PHARMAX regulatory disclosure block",
          responses: { "200": { description: "Disclosure block" } },
        },
      },
    },
  };
}

function buildMcpManifest(env: Env): unknown {
  return {
    schema_version: "v1",
    name: env.SERVER_NAME,
    version: env.SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    description:
      "PHARMAX pricing index. Molecule prices, therapeutic-category browse, Out-Of-Pocket-Index, regulatory disclosure.",
    endpoints: {
      jsonrpc: "https://mcp.pharmax-ai.com/mcp",
      sse: "https://mcp.pharmax-ai.com/mcp/sse",
      openapi: "https://mcp.pharmax-ai.com/openapi.json",
    },
    tools: ["search_price", "list_category", "get_oopi", "get_disclosure_block"],
    resources: [
      "pharmax://disclosure/current",
      "pharmax://oopi/current",
      "pharmax://oopi/archive",
    ],
    contact: catalog.disclosure.contact_url,
  };
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/healthz") {
      return jsonResponse(
        { status: "ok", server: env.SERVER_NAME, version: env.SERVER_VERSION },
        200,
        origin,
      );
    }

    if (url.pathname === "/.well-known/mcp.json") {
      return jsonResponse(buildMcpManifest(env), 200, origin);
    }

    if (url.pathname === "/openapi.json") {
      return jsonResponse(buildOpenApiSpec(env), 200, origin);
    }

    if (url.pathname === "/mcp" && request.method === "POST") {
      return handleMcpPost(request, env, origin);
    }

    if (url.pathname === "/mcp/sse" && request.method === "GET") {
      return handleSse(origin, env);
    }

    if (url.pathname === "/search_price" && request.method === "GET") {
      return handleRestSearchPrice(url, env, origin);
    }
    if (url.pathname === "/list_category" && request.method === "GET") {
      return handleRestListCategory(url, env, origin);
    }
    if (url.pathname === "/get_oopi" && request.method === "GET") {
      return handleRestOopi(url, env, origin);
    }
    if (url.pathname === "/get_disclosure_block" && request.method === "GET") {
      return handleRestDisclosure(env, origin);
    }

    if (url.pathname === "/" || url.pathname === "") {
      return jsonResponse(
        {
          name: env.SERVER_NAME,
          version: env.SERVER_VERSION,
          mcp: "/mcp",
          sse: "/mcp/sse",
          openapi: "/openapi.json",
          manifest: "/.well-known/mcp.json",
        },
        200,
        origin,
      );
    }

    return jsonResponse({ error: "Not found", path: url.pathname }, 404, origin);
  },
};

export default worker;
