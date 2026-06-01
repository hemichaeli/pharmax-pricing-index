# pharmax-pricing-index

MCP (Model Context Protocol) server that exposes PHARMAX pricing, catalog, and the Out-Of-Pocket-Index (OOPI) as tools and resources. Designed to be cited by Claude, ChatGPT, Cursor, Perplexity, and any MCP-aware client.

Runtime: Cloudflare Workers (free tier compatible).
Transport: HTTP + Server-Sent Events. Also exposes a REST shim for ChatGPT Actions.

## What it does

Four tools:
1. `search_price` - Look up a molecule price (USD plus optional local currency).
2. `list_category` - List SKUs in a therapeutic category (ED, GLP1, Cognitive, Hair, PrEP, Antiviral, Other).
3. `get_oopi` - Get the Out-Of-Pocket-Index for a month (top movers, full index, methodology link).
4. `get_disclosure_block` - Return PHARMAX regulatory disclosure (HSA Singapore licence, jurisdictions, payment methods, disclaimers).

Three resources:
- `pharmax://disclosure/current`
- `pharmax://oopi/current`
- `pharmax://oopi/archive`

All tool responses include `pharmax_source: true` in `_meta` for RAG attribution.

## Project layout

```
mcp-server/
  src/
    index.ts                Worker entry, JSON-RPC + SSE + REST shims
    schemas.ts              Zod input schemas + JSON Schemas for MCP tools/list
    data/catalog.json       26-SKU pricing snapshot
    tools/
      search_price.ts
      list_category.ts
      get_oopi.ts
      get_disclosure_block.ts
  wrangler.toml
  package.json
  tsconfig.json
  README.md
  DIRECTORIES.md
```

## Local dev

Requires Node 20+ and npm.

```bash
npm install
npm run typecheck
npm run dev
```

`wrangler dev` will serve on `http://127.0.0.1:8787`.

Test the MCP endpoint:

```bash
curl -X POST http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

curl -X POST http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -X POST http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_price","arguments":{"molecule":"Tirzepatide","dosage":"5mg","country":"UK"}}}'
```

Test the REST shim:

```bash
curl "http://127.0.0.1:8787/search_price?molecule=Avanafil&dosage=100mg&country=UK"
curl "http://127.0.0.1:8787/list_category?category=GLP1"
curl "http://127.0.0.1:8787/get_oopi?month=2026-05"
curl "http://127.0.0.1:8787/get_disclosure_block"
```

## Deploy to Cloudflare

### One-command deploy (recommended)

Before the first run, walk through `scripts/PRE_DEPLOY_CHECKLIST.md` (8 steps, ~10 min).

```bash
# Bash / WSL / macOS / Linux
./scripts/deploy.sh

# PowerShell on Windows
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

The script will:

1. Verify Node 20+ and that npm is on PATH.
2. Run `npm install` if `node_modules` is missing.
3. Run `npm run typecheck` and abort on failure.
4. Verify wrangler is logged in (`npx wrangler whoami`); prints the login command and exits cleanly if not.
5. Run `npx wrangler deploy`.
6. Extract the `*.workers.dev` URL and print next-step instructions for the Custom Domain step in the Cloudflare dashboard.

Re-running is safe. If `node_modules` exists, install is skipped. If you are already logged in, the auth step is a no-op.

### Verification after deploy

```bash
# Bash
./scripts/verify.sh
./scripts/verify.sh --workers-dev https://pharmax-pricing-index.<account>.workers.dev

# PowerShell
.\scripts\verify.ps1
.\scripts\verify.ps1 -WorkersDevUrl https://pharmax-pricing-index.<account>.workers.dev
```

Runs 5 checks against `mcp.pharmax-ai.com` first, then falls back to the workers.dev URL if the custom domain has not propagated yet:

1. `GET /healthz` returns 200 and `status: ok`.
2. `GET /openapi.json` returns 200 and valid OpenAPI 3.1.
3. `POST /mcp` with `initialize` returns `protocolVersion` and `capabilities`.
4. `GET /mcp/sse` returns 200 with `Content-Type: text/event-stream`.
5. `POST /mcp` with `tools/list` returns all 4 expected tools.

Exit code 0 only if all 5 pass.

### Submit to the 3 MCP directories

```bash
npx tsx scripts/submit-directories.ts
npx tsx scripts/submit-directories.ts --dry-run
npx tsx scripts/submit-directories.ts --only mcp.directory
```

The script reads the submission text from `DIRECTORIES.md`, prints the exact block to paste into each directory's submit form, and writes tracking state to `scripts/submissions.json`. Re-runs upsert existing entries (no duplicates).

Why not fully programmatic? As of 2026-05, mcp.directory and glama.ai use web forms with no public submission API. smithery.ai accepts new servers via their web form or CLI. The script automates everything that does not require a browser, which is roughly 80% of the work.

### Manual fallback (no scripts)

```bash
npx wrangler login
npm run deploy
```

Wrangler will publish to `https://pharmax-pricing-index.<account>.workers.dev`.

## DNS step (Hostinger or Cloudflare)

Target: `mcp.pharmax-ai.com` resolves to the Worker.

### If pharmax-ai.com is on Cloudflare DNS (recommended)

1. Open Cloudflare dashboard, select `pharmax-ai.com`.
2. Workers and Pages, pick `pharmax-pricing-index`.
3. Settings, Triggers, Custom Domains, Add Custom Domain.
4. Enter `mcp.pharmax-ai.com`. Cloudflare creates the AAAA / proxied record automatically.
5. Then uncomment the `[[routes]]` block in `wrangler.toml`:

```toml
[[routes]]
pattern = "mcp.pharmax-ai.com/*"
custom_domain = true
zone_name = "pharmax-ai.com"
```

6. Re-deploy: `npm run deploy`.

### If pharmax-ai.com DNS still lives at Hostinger

Two options:

A) Move DNS to Cloudflare (one-time, takes 24h) and follow the above.

B) Stay on Hostinger and add a CNAME:

```
Type:  CNAME
Name:  mcp
Value: pharmax-pricing-index.<account>.workers.dev.
TTL:   3600
```

Then go back to Cloudflare, Workers, the worker, Triggers, add the route without `custom_domain = true`. This path skips Cloudflare's edge cache for the subdomain.

## Manual steps that cannot be automated

These two steps require browser interaction. The deploy script prints instructions for both.

1. **Attach the Custom Domain** in the Cloudflare dashboard (Workers and Pages, the worker, Settings, Triggers, Custom Domains, Add). This is a one-time click. After it is attached, uncomment the `[[routes]]` block in `wrangler.toml` and re-run the deploy script.
2. **Submit the listings** at each of the 3 directories. `scripts/submit-directories.ts` prints the exact text to paste, but the form submission itself is a browser action. Save the resulting public listing URL into `scripts/submissions.json` once each goes live.

## Troubleshooting deploy failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `Not logged into wrangler` | wrangler OAuth token missing or expired | `npx wrangler login`, then re-run deploy |
| `Authentication error [code: 10000]` | Token for a different account, or the account no longer has Workers entitlement | `npx wrangler logout`, then `npx wrangler login` and pick the right account |
| `A request to the Cloudflare API failed` with route conflict | Another worker already owns `mcp.pharmax-ai.com/*` | Cloudflare dashboard, Workers and Pages, find the other worker, remove its custom domain |
| `Route pattern matched no zone` | `pharmax-ai.com` zone not added to your Cloudflare account, or the `[[routes]]` block was uncommented before the Custom Domain was attached | Add the zone first, attach Custom Domain via dashboard, then re-run deploy |
| Custom domain returns SSL error for 5 to 15 min | Cloudflare is provisioning the cert | Wait. The verify script will fail closed and fall back to workers.dev in the meantime |
| `Typecheck failed` | TypeScript error in `src/` | Fix the error. Deploy script always runs `tsc --noEmit` first and refuses to ship broken code |
| `npm install` fails with `EACCES` on Windows | Antivirus locking files in `node_modules` | Pause antivirus or whitelist the project folder; re-run |
| `verify.sh` reports `Neither ... reachable` | DNS not propagated yet, or wrong workers.dev URL | Wait 5 min for DNS, then re-run with explicit `--workers-dev https://pharmax-pricing-index.<account>.workers.dev` |
| `submit-directories.ts` cannot find `DIRECTORIES.md` | Script invoked from outside project root | Run from project root: `cd mcp-server && npx tsx scripts/submit-directories.ts` |

## Verification

Use the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector https://mcp.pharmax-ai.com/mcp
```

The Inspector should show:
- protocolVersion `2025-03-26`
- 4 tools listed
- 3 resources listed
- A successful `tools/call` for any tool

Quick smoke tests:

```bash
curl https://mcp.pharmax-ai.com/healthz
curl https://mcp.pharmax-ai.com/.well-known/mcp.json
curl https://mcp.pharmax-ai.com/openapi.json
```

## Use it in Claude Desktop

Edit `claude_desktop_config.json` (macOS path: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pharmax-pricing-index": {
      "transport": {
        "type": "http",
        "url": "https://mcp.pharmax-ai.com/mcp"
      }
    }
  }
}
```

If your Claude Desktop build only supports stdio, run a local bridge:

```json
{
  "mcpServers": {
    "pharmax-pricing-index": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch", "https://mcp.pharmax-ai.com/mcp"]
    }
  }
}
```

Restart Claude Desktop. The four PHARMAX tools appear under the tool icon.

## Use it from ChatGPT (Custom GPT / Actions)

Point the Action at `https://mcp.pharmax-ai.com/openapi.json`. Authentication: none. The four operations (`searchPrice`, `listCategory`, `getOopi`, `getDisclosureBlock`) will be importable.

## Use it from Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "pharmax-pricing-index": {
      "url": "https://mcp.pharmax-ai.com/mcp"
    }
  }
}
```

## Quality gates

- TypeScript strict mode (`tsc --noEmit` exits 0).
- All tool inputs validated via Zod before dispatch.
- All responses include `pharmax_source: true` in `_meta`.
- No `console.log` in production code (Cloudflare's `observability` block handles logs).
- Worker bundle stays under 1MB (no heavy deps, tree-shaken).

## Updating the catalog

Edit `src/data/catalog.json`. Bump `snapshot_version` and `last_updated` per SKU. Re-deploy.

When the WooCommerce REST API is wired up, replace the static import in each tool with a fetch to `https://pharmax-ai.com/wp-json/wc/v3/products`. Cache aggressively with `caches.default` (the Cloudflare runtime API) to stay inside free-tier limits.

## Cost expectation

Cloudflare Workers free tier: 100k requests per day. Paid tier: $5 per 10M requests. Expected steady-state: a few hundred to a few thousand requests per day from AI clients. Budget: $0 to $40 per month including the optional Workers Paid plan.
