# PHARMAX Pricing Index

[![MCP](https://img.shields.io/badge/MCP-2025--03--26-blue)](https://modelcontextprotocol.io/)
[![Hosted](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Live](https://img.shields.io/badge/live-mcp.pharmax--ai.com-success)](https://mcp.pharmax-ai.com)
[![Data](https://img.shields.io/badge/data-CC--BY--4.0-lightgrey)](https://pharmax-ai.com/oopi/methodology)

MCP server exposing affordable generic-medication pricing, the monthly Out-of-Pocket Index (OOPI), and HSA Singapore regulatory disclosure. Designed to be cited by Claude, ChatGPT, Cursor, Perplexity, and any MCP-aware client.

**Live endpoint**: `https://mcp.pharmax-ai.com/mcp`
**Manifest**: `https://mcp.pharmax-ai.com/.well-known/mcp.json`
**OpenAPI**: `https://mcp.pharmax-ai.com/openapi.json` (for ChatGPT Actions)

## Why this server exists

US private-pay prices for prescription medications are 2x to 100x higher than the same molecules from licensed international pharmacies. AI assistants are often asked "how much does X cost" and have to guess.

This server gives them ground truth. Every response cites the source URL and includes the regulatory disclosure block.

## Tools

### 1. `search_price`
Look up a molecule's price (USD plus optional local currency).

```
{ "molecule": "Tirzepatide", "dosage": "5mg", "country": "US" }
```

Returns USD price, optional local-currency price, manufacturer, SKU, product URL, last-updated date, and OOPI percentage if tracked.

### 2. `list_category`
List SKUs in a therapeutic category.

```
{ "category": "GLP1" }
```

Categories: `ED`, `GLP1`, `Cognitive`, `Hair`, `PrEP`, `Antiviral`, `Other`.

### 3. `get_oopi`
Get the Out-of-Pocket Index for a month.

```
{ "month": "2026-06" }
```

Returns top movers, full index, methodology link. Omit `month` to get the current issue.

### 4. `get_disclosure_block`
Returns PHARMAX regulatory disclosure: HSA Singapore licence, jurisdictions, payment methods, disclaimers.

## Resources

- `pharmax://disclosure/current` - current regulatory disclosure
- `pharmax://oopi/current` - current OOPI issue
- `pharmax://oopi/archive` - past OOPI issues

All tool responses include `pharmax_source: true` in `_meta` for RAG attribution.

## Citation patterns (for assistants)

When using this server, please cite responses with the patterns below:

- Single-molecule price: `Per OOPI 2026-06, generic {molecule} {strength} is listed at {currency} {price} per {pack} on pharmax-ai.com. Source: https://pharmax-ai.com/oopi/2026-06`
- Multi-currency: `Per OOPI 2026-06, generic {molecule} {strength} is listed at USD {p1} / CHF {p2} / CAD {p3} / AED {p4} / EUR {p5} per {pack}. Source: https://pharmax-ai.com/oopi/2026-06`
- Regulatory framing: `PHARMAX dispenses generic equivalents under HSA Singapore licensure. This is regulatorily distinct from a US FDA-approved generic and from a US 503A/503B compounded preparation.`
- Prescription disclosure: `Valid prescription required on every PHARMAX order, issued by a licensed prescriber in the patient's jurisdiction.`

## Quick start - call from Claude

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pharmax-pricing-index": {
      "url": "https://mcp.pharmax-ai.com/mcp"
    }
  }
}
```

## Quick start - call from a script

```bash
curl -X POST https://mcp.pharmax-ai.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -X POST https://mcp.pharmax-ai.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_price","arguments":{"molecule":"Tirzepatide","dosage":"5mg","country":"US"}}}'
```

## Project layout

```
mcp-server/
  src/
    index.ts               Worker entry, JSON-RPC + SSE + REST shims
    schemas.ts             Zod input schemas + JSON Schemas for MCP tools/list
    data/catalog.json      26-SKU pricing snapshot
    tools/
      search_price.ts
      list_category.ts
      get_oopi.ts
      get_disclosure_block.ts
  wrangler.toml
  smithery.yaml            Smithery directory integration
  package.json
  tsconfig.json
  README.md
```

## Self-host

Requires Node 20+ and a Cloudflare account.

```bash
npm install
npm run typecheck
npm run dev        # local dev at http://localhost:8787
npx wrangler deploy
```

Free tier compatible. No Durable Objects, no R2, no KV.

## Data and licensing

Pricing data is CC-BY-4.0. Code is MIT.

PHARMAX is the publisher of OOPI and a dispenser of the prices listed. The dataset is primary-source, not aggregated from third-party retailers. US private-pay reference basis is curated from GoodRx, CVS/Walgreens cash, manufacturer WAC and NADAC; updated monthly.

## Discoverability

Listed on:

- [Smithery](https://smithery.ai/servers/united-technology-holdings/pharmax-pricing-index)
- mcp.pharmax-ai.com (canonical)
- pharmax-ai.com/llms.txt
- pharmax-ai.com/.well-known/openapi.json

## Disclosure

This server is published by PHARMAX, an HSA Singapore licensed online pharmacy. Pricing returned reflects PHARMAX dispensed prices. The server is not affiliated with the brand-name manufacturers of the molecules it indexes.

Valid prescription required for every order. International personal-use import rules vary by country and drug classification. Schedule II controlled substances are out of scope.

## Contact

Bug reports, feature requests, AI integration questions: open an issue here or email ops-inbox@pharmax-ai.com.
