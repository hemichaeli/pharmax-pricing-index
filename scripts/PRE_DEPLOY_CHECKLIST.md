# Pre-deploy checklist (founder, 8 steps)

Run through this list once before the first `./scripts/deploy.sh` of a given environment. Re-runs are fine on later deploys but only the auth step and the catalog review tend to change.

Estimated time: 10 to 15 minutes the first time. 1 minute on subsequent runs.

---

## 1. Cloudflare account exists and owns the pharmax-ai.com zone

- Log into https://dash.cloudflare.com.
- Confirm `pharmax-ai.com` appears in the zone list.
- If the zone is not yet on Cloudflare, add it: Dashboard, Add a site, follow the nameserver swap instructions.
- DNS propagation after a nameserver swap is 1 to 24 hours. The script can deploy to `*.workers.dev` immediately even if the zone is still propagating.

If pharmax-ai.com lives on Hostinger and you do not want to move DNS, the CNAME-flattening path in `README.md` still works. The script will deploy successfully either way.

## 2. Wrangler CLI is available

- The deploy script uses `npx --no-install wrangler`, which resolves the local `node_modules/.bin/wrangler` after `npm install`.
- You do not need to install wrangler globally.
- If you prefer a global install: `npm install -g wrangler`. Either path works.

## 3. Logged into wrangler via OAuth

Run once per machine:

```
npx wrangler login
```

This opens a browser tab and ties wrangler to your Cloudflare account.

Verify:

```
npx wrangler whoami
```

You should see your account email and account ID. The deploy script checks this and exits cleanly if you are logged out.

## 4. Catalog placeholders reviewed

Open `src/data/catalog.json` and search for:

- `hsa_license` or any HSA Singapore licence reference. Confirm it matches the registered licence number on file. If it is still a placeholder, decide now: ship as-is for the soft launch, or replace before any external traffic lands.
- `last_updated` per SKU. Bump to today's date if any prices changed since the last deploy.
- `snapshot_version`. Bump when the OOPI snapshot rolls.

The MCP server is read-only and ships exactly what is in `catalog.json`. Anything wrong here is wrong on the wire.

## 5. DIRECTORIES.md submission text reviewed

Open `DIRECTORIES.md` and read each of the three blocks (mcp.directory, smithery.ai, glama.ai).

Confirm:

- No founder name anywhere (PHARMAX brand rule).
- No em-dashes or en-dashes. Hyphens only.
- The tagline still reads true. Description still matches what the four tools do.
- The endpoint URL `https://mcp.pharmax-ai.com/mcp` is correct (or update if you are routing through a different subdomain).

These blocks are what `scripts/submit-directories.ts` reads and prints. Edit there, not in the script.

## 6. DNS for pharmax-ai.com is at Cloudflare OR you accept CNAME flattening

Two supported paths:

- (Recommended) DNS hosted at Cloudflare. The deploy adds `mcp.pharmax-ai.com` as a Custom Domain in one click. Proxy traffic, edge cache, free SSL, all automatic.
- (Acceptable) DNS still at Hostinger. You add a CNAME `mcp -> <worker>.workers.dev` at Hostinger. Slower TLS first-byte than path A. Edge cache works but proxy features do not.

If neither path is feasible right now, deploy will still succeed against the `*.workers.dev` URL. Custom domain can be wired later. The verify script accepts a `--workers-dev` flag for this case.

## 7. Cost expectation acknowledged

- Cloudflare Workers free tier covers 100,000 requests per day.
- Expected steady-state traffic from MCP clients: a few hundred to a few thousand requests per day.
- Paid tier kicks in at $5 per month if you exceed free tier and you opt into the Workers Paid plan.
- Worst case budget for this server in 2026: $5 to $10 per month. No surprise five-figure bills are possible at current architecture.

If you want a hard cap, set a Cloudflare billing limit at $25 per month in Account Home, Billing, Subscription Limits.

## 8. Backup of DIRECTORIES.md submission text

Before running `scripts/submit-directories.ts`, save a copy of `DIRECTORIES.md` somewhere outside this repo:

- Drop into Drive: `PHARMAX/launch-2026-05/DIRECTORIES-backup-<date>.md`
- Or paste into a Notion page.
- Or even just `cp DIRECTORIES.md ~/Desktop/DIRECTORIES-backup.md`.

Rationale: if mid-submission the script errors out and a directory rejects, you want the exact text you submitted preserved for resubmission or appeal. The script prints the block to stdout each run, so terminal scrollback is also a backup if you do not close the window.

---

## Ready

When all 8 boxes are ticked, run:

```
./scripts/deploy.sh        # or .\scripts\deploy.ps1 on Windows pwsh
./scripts/verify.sh        # after DNS resolves; or pass --workers-dev <url>
npx tsx scripts/submit-directories.ts
```

The whole sequence takes 5 to 10 minutes including the manual Custom Domain step in the Cloudflare dashboard.
