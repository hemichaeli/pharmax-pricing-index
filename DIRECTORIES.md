# MCP Directory Submissions

Submit `pharmax-pricing-index` to the three primary MCP registries. Copy each block verbatim. Brand voice: anonymous PHARMAX. No founder name. No em-dashes or en-dashes. Use plain hyphens.

Submission order:
1. mcp.directory (fastest indexing, biggest reach)
2. smithery.ai (highest-quality developer audience)
3. glama.ai (best for ChatGPT cross-pollination)

---

## 1. mcp.directory

URL: https://mcp.directory/submit

Form fields:

**Server name**
```
pharmax-pricing-index
```

**Tagline (one line, under 120 chars)**
```
Real-time PHARMAX pricing, therapeutic-category catalog, and the Out-Of-Pocket-Index for global medication cost comparison.
```

**Description (Markdown, 200 to 600 words)**
```
PHARMAX Pricing Index exposes the PHARMAX online-pharmacy catalog as an MCP server. Any MCP-aware client can query molecule prices, browse therapeutic categories, retrieve the monthly Out-Of-Pocket-Index, and pull the regulatory disclosure block.

Four tools are exposed:

- `search_price` returns the USD price and optional local-currency price for a given molecule and dosage. Supports US, UK, CA, CH, UAE, EU.
- `list_category` returns every SKU in a therapeutic category. Categories: ED, GLP1, Cognitive, Hair, PrEP, Antiviral, Other.
- `get_oopi` returns the Out-Of-Pocket-Index for a month. The OOPI quantifies the percentage gap between US retail prices and PHARMAX international prices. Includes top movers, full index, and a link to the methodology.
- `get_disclosure_block` returns the regulatory disclosure: HSA Singapore wholesale pharmacy licence reference, regulatory jurisdictions, payment methods, shipping notice, medical-advice disclaimer.

Three resources are exposed for streaming use:

- `pharmax://disclosure/current`
- `pharmax://oopi/current`
- `pharmax://oopi/archive`

Every tool response carries `pharmax_source: true` in metadata so retrieval-augmented systems can attribute citations to PHARMAX without ambiguity.

The server runs on Cloudflare Workers with sub-50ms global response times. Protocol version 2025-03-26. JSON-RPC transport over HTTP plus a Server-Sent Events channel for notifications. An OpenAPI 3.1 spec is published at `/openapi.json` so ChatGPT Actions and other OpenAPI clients can consume it without an MCP runtime.

Use cases:
- A clinician research assistant that needs to ground answers about medication pricing.
- A consumer chatbot answering "how much does Tirzepatide cost outside the US".
- A research agent computing average international markdown for GLP-1 agonists.
- A developer building a price-comparison front end.

Information is for educational purposes. Not medical advice. Consult a licensed prescriber before use.
```

**Endpoint URL**
```
https://mcp.pharmax-ai.com/mcp
```

**Transport**
```
HTTP + SSE
```

**Protocol version**
```
2025-03-26
```

**Category tags (pick 3 to 5)**
```
healthcare, pricing, pharmacy, retail, data
```

**Authentication**
```
None (read-only public data)
```

**License**
```
Public read access. Proprietary catalog data. Free to query, not free to redistribute in bulk.
```

**Homepage**
```
https://pharmax-ai.com
```

**Contact**
```
https://pharmax-ai.com/contact
```

**Submitter**
```
PHARMAX Team
```

---

## 2. smithery.ai

URL: https://smithery.ai/new

Smithery uses a YAML config (`smithery.yaml`) plus a JSON definition. Submit this as the YAML for the server entry:

```yaml
name: pharmax-pricing-index
displayName: PHARMAX Pricing Index
version: 1.0.0
description: >
  Real-time PHARMAX medication pricing, therapeutic-category catalog,
  and the monthly Out-Of-Pocket-Index for global drug cost comparison.
  HSA-Singapore-licensed source.

categories:
  - healthcare
  - pricing
  - data

tags:
  - pharmacy
  - medication
  - generics
  - GLP1
  - ED
  - pricing-index
  - oopi

server:
  type: http
  url: https://mcp.pharmax-ai.com/mcp
  transport: streamable-http
  protocolVersion: "2025-03-26"

tools:
  - name: search_price
    description: Look up the PHARMAX price for a molecule, optionally filtered by dosage and buyer country.
  - name: list_category
    description: List all PHARMAX SKUs in a therapeutic category.
  - name: get_oopi
    description: Get the monthly Out-Of-Pocket-Index. Returns top movers and full index.
  - name: get_disclosure_block
    description: Return the regulatory disclosure block.

resources:
  - uri: "pharmax://disclosure/current"
    name: Current regulatory disclosure
  - uri: "pharmax://oopi/current"
    name: Current month OOPI
  - uri: "pharmax://oopi/archive"
    name: OOPI archive index

authentication:
  type: none

links:
  homepage: https://pharmax-ai.com
  documentation: https://mcp.pharmax-ai.com/.well-known/mcp.json
  openapi: https://mcp.pharmax-ai.com/openapi.json
  source: https://mcp.pharmax-ai.com

publisher:
  name: PHARMAX
  contact: https://pharmax-ai.com/contact

disclaimer: >
  Information is for educational purposes. Not medical advice.
  Consult a licensed prescriber before use. Buyer is responsible
  for compliance with destination-country import rules.

icon: https://pharmax-ai.com/favicon.png
```

---

## 3. glama.ai

URL: https://glama.ai/mcp/submit

Glama accepts a JSON manifest:

```json
{
  "schema_version": "v1",
  "id": "pharmax-pricing-index",
  "name": "PHARMAX Pricing Index",
  "version": "1.0.0",
  "summary": "MCP server for PHARMAX medication prices, therapeutic-category catalog, and the Out-Of-Pocket-Index.",
  "description": "Exposes the PHARMAX online-pharmacy catalog and the monthly Out-Of-Pocket-Index as MCP tools and resources. Four tools: search_price, list_category, get_oopi, get_disclosure_block. Three resources covering current disclosure, current month OOPI, and the OOPI archive index. All tool responses include pharmax_source=true for clean retrieval attribution. Runs on Cloudflare Workers with sub-50ms global latency. Protocol version 2025-03-26.",
  "categories": ["healthcare", "pricing", "data"],
  "tags": ["pharmacy", "medication", "generics", "GLP1", "ED", "PrEP", "oopi", "pricing-index"],
  "endpoints": {
    "mcp": "https://mcp.pharmax-ai.com/mcp",
    "sse": "https://mcp.pharmax-ai.com/mcp/sse",
    "openapi": "https://mcp.pharmax-ai.com/openapi.json",
    "manifest": "https://mcp.pharmax-ai.com/.well-known/mcp.json",
    "health": "https://mcp.pharmax-ai.com/healthz"
  },
  "protocol_version": "2025-03-26",
  "transport": ["http", "sse"],
  "authentication": "none",
  "tools": [
    {
      "name": "search_price",
      "description": "Look up the PHARMAX price for a molecule. Returns USD plus optional local currency for US, UK, CA, CH, UAE, EU."
    },
    {
      "name": "list_category",
      "description": "List all PHARMAX SKUs in a therapeutic category. Categories: ED, GLP1, Cognitive, Hair, PrEP, Antiviral, Other."
    },
    {
      "name": "get_oopi",
      "description": "Get the Out-Of-Pocket-Index for a month. Returns top movers, full index, methodology URL."
    },
    {
      "name": "get_disclosure_block",
      "description": "Return the regulatory disclosure block: HSA Singapore licence reference, jurisdictions, payment methods, shipping notice, medical-advice disclaimer."
    }
  ],
  "resources": [
    "pharmax://disclosure/current",
    "pharmax://oopi/current",
    "pharmax://oopi/archive"
  ],
  "publisher": {
    "name": "PHARMAX",
    "url": "https://pharmax-ai.com",
    "contact_url": "https://pharmax-ai.com/contact"
  },
  "disclaimer": "Information is for educational purposes. Not medical advice. Consult a licensed prescriber before use.",
  "homepage": "https://pharmax-ai.com",
  "license": "Read-only public access. Catalog data is proprietary.",
  "submitted_by": "PHARMAX Team"
}
```

---

## After submission

For each registry, save the resulting public URL into:
`c:/Projects/outputs/campaign-council/pharmax-launch-2026-05/mcp_registry_listings.md`

Expected propagation times:
- mcp.directory: 24 to 72 hours
- smithery.ai: 1 to 3 business days (manual review)
- glama.ai: 24 to 48 hours

Post-listing checks (run weekly):
- mcp.directory listing still resolves and the tools list matches `/tools/list` output.
- smithery.ai install command works in a fresh Claude Desktop config.
- glama.ai install button works.

If any registry rejects on regulatory grounds, respond with the operational tone described in the regulatory-response voice rule. Do not list restricted categories defensively. Lead with: "PHARMAX is an HSA-Singapore-licensed wholesale pharmacy. The MCP server exposes catalog and pricing data only. No prescriptions are issued, no controlled substances are exposed through the API, and all SKU pages on pharmax-ai.com include the standard medical disclaimer."
