/**
 * submit-directories.ts
 *
 * Submit pharmax-pricing-index to the 3 MCP directories.
 *
 * Behaviour per directory (verified 2026-05; intentionally conservative):
 *   - mcp.directory : web form submission. No public API. Script extracts the
 *                     ready-to-paste block from DIRECTORIES.md and prints the
 *                     submit URL.
 *   - smithery.ai   : registry is GitHub-backed (PR against smithery-ai/registry
 *                     or via the smithery CLI). No drive-by JSON POST. Script
 *                     prints the YAML block and the URL for the PR template.
 *   - glama.ai      : web form submission. No public submission API. Script
 *                     prints the JSON manifest and the submit URL.
 *
 * If any directory ships a real POST endpoint later, drop it into the
 * SUBMITTERS table below and set `mode: "api"`. The dispatch logic is generic.
 *
 * State is tracked in submissions.json next to this file. Re-running is safe:
 * existing entries are updated, not duplicated.
 *
 * Usage:
 *   npx tsx scripts/submit-directories.ts
 *   npx tsx scripts/submit-directories.ts --dry-run
 *   npx tsx scripts/submit-directories.ts --only mcp.directory
 *
 * No external deps. Only Node 20+ built-ins.
 */

import { readFile, writeFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIRECTORIES_MD = path.join(PROJECT_ROOT, "DIRECTORIES.md");
const SUBMISSIONS_JSON = path.join(__dirname, "submissions.json");

// ---------- args ----------
interface Args {
  dryRun: boolean;
  only: string | null;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") out.dryRun = true;
    else if (a === "--only" && argv[i + 1]) {
      out.only = argv[i + 1] ?? null;
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: tsx scripts/submit-directories.ts [--dry-run] [--only <name>]");
      process.exit(0);
    }
  }
  return out;
}

// ---------- types ----------
type SubmitMode = "form" | "github-pr" | "api";

interface Submitter {
  name: string;             // canonical id, e.g. "mcp.directory"
  submitUrl: string;        // human-facing URL
  mode: SubmitMode;
  section: string;          // markdown header in DIRECTORIES.md to extract
  // For mode = "api" only:
  apiEndpoint?: string;
  apiMethod?: "POST" | "PUT";
  apiContentType?: string;
}

interface SubmissionRecord {
  directory: string;
  submitted_at: string;     // ISO timestamp of last attempt
  status: "queued" | "submitted" | "live" | "rejected";
  mode: SubmitMode;
  submit_url: string;
  listing_url?: string;     // populated by founder once it goes live
  pr_url?: string;
  notes?: string;
  payload_excerpt?: string; // first 240 chars of the payload
}

interface SubmissionsFile {
  schema_version: 1;
  updated_at: string;
  entries: Record<string, SubmissionRecord>;
}

// ---------- registry of directories ----------
const SUBMITTERS: Submitter[] = [
  {
    name: "mcp.directory",
    submitUrl: "https://mcp.directory/submit",
    mode: "form",
    section: "1. mcp.directory",
  },
  {
    name: "smithery.ai",
    submitUrl: "https://smithery.ai/new",
    mode: "github-pr",
    section: "2. smithery.ai",
  },
  {
    name: "glama.ai",
    submitUrl: "https://glama.ai/mcp/submit",
    mode: "form",
    section: "3. glama.ai",
  },
];

// ---------- DIRECTORIES.md parser ----------
/**
 * Extract the block between `## <sectionHeader>` and the next `## ` (or `---` / EOF).
 * Returns the raw markdown including embedded code fences.
 */
function extractSection(markdown: string, sectionHeader: string): string {
  const escaped = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---\\s*\\n|$)`);
  const m = markdown.match(re);
  if (!m) {
    throw new Error(`Section "${sectionHeader}" not found in DIRECTORIES.md`);
  }
  return (m[2] ?? "").trim();
}

// ---------- state ----------
async function loadSubmissions(): Promise<SubmissionsFile> {
  try {
    await access(SUBMISSIONS_JSON, FS.R_OK);
    const raw = await readFile(SUBMISSIONS_JSON, "utf8");
    const parsed = JSON.parse(raw) as SubmissionsFile;
    if (parsed.schema_version !== 1) {
      throw new Error(`Unsupported submissions.json schema_version ${parsed.schema_version}`);
    }
    parsed.entries ??= {};
    return parsed;
  } catch {
    return {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      entries: {},
    };
  }
}

async function saveSubmissions(s: SubmissionsFile, dryRun: boolean): Promise<void> {
  s.updated_at = new Date().toISOString();
  const body = JSON.stringify(s, null, 2) + "\n";
  if (dryRun) {
    console.log(`[dry-run] would write ${SUBMISSIONS_JSON} (${body.length} bytes)`);
    return;
  }
  await writeFile(SUBMISSIONS_JSON, body, "utf8");
}

// ---------- dispatch handlers ----------
interface DispatchResult {
  ok: boolean;
  status: SubmissionRecord["status"];
  notes: string;
  payloadExcerpt: string;
  prUrl?: string;
}

function dispatchForm(submitter: Submitter, sectionBody: string): DispatchResult {
  console.log("");
  console.log(`---- ${submitter.name} (web form) ----`);
  console.log(`Submit URL:  ${submitter.submitUrl}`);
  console.log("");
  console.log("Open the URL in your browser. Copy the block below into the form fields.");
  console.log("Field names are the bold labels (e.g. **Server name**). Code-fence contents go into the field below the label.");
  console.log("");
  console.log("---- BEGIN SUBMISSION BLOCK ----");
  console.log(sectionBody);
  console.log("---- END SUBMISSION BLOCK ----");
  console.log("");
  return {
    ok: true,
    status: "queued",
    notes: "Manual web-form submission. Paste block into form at submitUrl.",
    payloadExcerpt: sectionBody.slice(0, 240),
  };
}

function dispatchGithubPr(submitter: Submitter, sectionBody: string): DispatchResult {
  // smithery.ai accepts new servers via:
  //   - https://smithery.ai/new web form (current primary)
  //   - smithery CLI (`npx -y @smithery/cli@latest init`)
  // The block in DIRECTORIES.md is the YAML config they ask for.
  console.log("");
  console.log(`---- ${submitter.name} (GitHub PR / web submit) ----`);
  console.log(`Submit URL:  ${submitter.submitUrl}`);
  console.log("");
  console.log("smithery accepts new servers via their web submit page (preferred) or their CLI.");
  console.log("Easiest path: open the submit URL, click 'Add Server', paste the YAML below.");
  console.log("");
  console.log("CLI alternative (if a registry PR is required):");
  console.log("    npx -y @smithery/cli@latest init pharmax-pricing-index");
  console.log("");
  console.log("---- BEGIN SMITHERY YAML ----");
  console.log(sectionBody);
  console.log("---- END SMITHERY YAML ----");
  console.log("");
  return {
    ok: true,
    status: "queued",
    notes: "Smithery submission via web form. Paste YAML block from DIRECTORIES.md section 2.",
    payloadExcerpt: sectionBody.slice(0, 240),
  };
}

async function dispatchApi(submitter: Submitter, sectionBody: string, dryRun: boolean): Promise<DispatchResult> {
  if (!submitter.apiEndpoint) {
    return {
      ok: false,
      status: "queued",
      notes: "API mode chosen but no apiEndpoint configured.",
      payloadExcerpt: sectionBody.slice(0, 240),
    };
  }
  console.log("");
  console.log(`---- ${submitter.name} (API) ----`);
  console.log(`POST ${submitter.apiEndpoint}`);

  if (dryRun) {
    console.log("[dry-run] would POST payload (truncated):");
    console.log(sectionBody.slice(0, 600));
    return {
      ok: true,
      status: "queued",
      notes: "Dry run; no request sent.",
      payloadExcerpt: sectionBody.slice(0, 240),
    };
  }

  const res = await fetch(submitter.apiEndpoint, {
    method: submitter.apiMethod ?? "POST",
    headers: { "Content-Type": submitter.apiContentType ?? "application/json" },
    body: sectionBody,
  });
  const responseText = await res.text();
  if (!res.ok) {
    console.log(`[fail] HTTP ${res.status}: ${responseText.slice(0, 240)}`);
    return {
      ok: false,
      status: "rejected",
      notes: `API responded HTTP ${res.status}`,
      payloadExcerpt: sectionBody.slice(0, 240),
    };
  }
  console.log("[ok] API accepted submission.");
  return {
    ok: true,
    status: "submitted",
    notes: `API returned HTTP ${res.status}.`,
    payloadExcerpt: sectionBody.slice(0, 240),
  };
}

// ---------- main ----------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[submit] dry-run=${args.dryRun} only=${args.only ?? "(all)"}`);

  let directoriesMd: string;
  try {
    directoriesMd = await readFile(DIRECTORIES_MD, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[submit] cannot read DIRECTORIES.md: ${msg}`);
    process.exit(2);
  }

  const store = await loadSubmissions();
  let failures = 0;

  for (const sub of SUBMITTERS) {
    if (args.only && args.only !== sub.name) continue;

    let sectionBody: string;
    try {
      sectionBody = extractSection(directoriesMd, sub.section);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[submit] ${sub.name}: ${msg}`);
      failures++;
      continue;
    }

    let result: DispatchResult;
    try {
      switch (sub.mode) {
        case "form":
          result = dispatchForm(sub, sectionBody);
          break;
        case "github-pr":
          result = dispatchGithubPr(sub, sectionBody);
          break;
        case "api":
          result = await dispatchApi(sub, sectionBody, args.dryRun);
          break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[submit] ${sub.name} threw: ${msg}`);
      failures++;
      continue;
    }

    // Upsert (idempotent).
    const existing = store.entries[sub.name];
    const record: SubmissionRecord = {
      directory: sub.name,
      submitted_at: new Date().toISOString(),
      status: result.status,
      mode: sub.mode,
      submit_url: sub.submitUrl,
      notes: result.notes,
      payload_excerpt: result.payloadExcerpt,
    };
    if (existing?.listing_url) record.listing_url = existing.listing_url;
    if (existing?.pr_url) record.pr_url = existing.pr_url;
    if (result.prUrl) record.pr_url = result.prUrl;

    store.entries[sub.name] = record;
    if (!result.ok) failures++;
  }

  await saveSubmissions(store, args.dryRun);

  console.log("");
  console.log("---- Summary ----");
  for (const k of Object.keys(store.entries)) {
    const e = store.entries[k];
    if (!e) continue;
    const tag = e.listing_url ? `live at ${e.listing_url}` : `${e.status} (${e.mode})`;
    console.log(`  ${k.padEnd(16)} ${tag}`);
  }
  console.log("");
  console.log(`State file: ${SUBMISSIONS_JSON}`);
  console.log("Update listing_url manually once each directory publishes the listing.");

  if (failures > 0) {
    console.error(`[submit] ${failures} failure(s).`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[submit] fatal: ${msg}`);
  process.exit(1);
});
