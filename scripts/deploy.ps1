# pharmax-pricing-index deploy script (PowerShell 5.1+ / pwsh 7+)
# Idempotent. Safe to re-run. Stops on first failure.
#
# Usage from project root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
#   pwsh -File .\scripts\deploy.ps1

# PSScriptAnalyzer: Write-Host is the correct tool for interactive deploy output
# (visible regardless of caller's $InformationPreference). The Information stream
# would force every consumer to pass -InformationAction Continue.
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Interactive CLI script.')]
param()
$ErrorActionPreference = 'Stop'

# Resolve project root (one level above scripts/)
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location -Path $ProjectRoot

function Write-Note { param([string]$Message) Write-Host "[deploy] $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "[ ok ] $Message"  -ForegroundColor Green }
function Write-Warn2 { param([string]$Message) Write-Host "[warn] $Message"  -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host "[fail] $Message"  -ForegroundColor Red }
function Write-Step { param([string]$Message)
    Write-Host ""
    Write-Host ("== {0} ==" -f $Message) -ForegroundColor White
}

# ---------- Step 1: prerequisites ----------
Write-Step "Step 1 of 6  Prerequisites"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Fail "node not found on PATH. Install Node 20+ and re-run."
    exit 1
}

$nodeVersion = (& node -v).TrimStart('v')
$nodeMajor   = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 20) {
    Write-Fail "Node $nodeVersion detected. Need Node 20 or higher."
    exit 1
}
Write-Ok "Node v$nodeVersion detected."

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Fail "npm not found on PATH."
    exit 1
}
$npmVersion = (& npm -v).Trim()
Write-Ok "npm $npmVersion detected."

$npxCmd = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npxCmd) {
    Write-Fail "npx not found on PATH."
    exit 1
}

# ---------- Step 2: dependencies ----------
Write-Step "Step 2 of 6  Dependencies"

$haveNodeModules = (Test-Path 'node_modules') -and (Test-Path 'node_modules/.package-lock.json')
if ($haveNodeModules) {
    Write-Ok "node_modules already present. Skipping npm install."
} else {
    Write-Note "node_modules missing. Running npm install ..."
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed."
        exit 1
    }
    Write-Ok "npm install complete."
}

# ---------- Step 3: typecheck ----------
Write-Step "Step 3 of 6  Typecheck"
Write-Note "Running npm run typecheck ..."
& npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Typecheck failed. Fix TypeScript errors before deploying."
    exit 1
}
Write-Ok "Typecheck passed."

# ---------- Step 4: wrangler auth ----------
Write-Step "Step 4 of 6  Cloudflare auth"

$whoamiOutput = $null
$whoamiOk     = $false
try {
    # 2>&1 merges stderr into the pipeline. NativeCommandError can still raise even
    # under -ErrorAction Stop, so we wrap in try/catch.
    $whoamiOutput = & npx --no-install wrangler whoami 2>&1
    if ($LASTEXITCODE -eq 0) { $whoamiOk = $true }
} catch {
    $whoamiOk = $false
}

if (-not $whoamiOk) {
    Write-Fail "Not logged into wrangler."
    Write-Host ""
    Write-Host "Run this in a fresh terminal, then re-run this script:"
    Write-Host ""
    Write-Host "    npx wrangler login"
    Write-Host ""
    Write-Host "wrangler will open a browser tab to authorize your Cloudflare account."
    exit 1
}

Write-Ok "wrangler is authenticated."
if ($whoamiOutput) {
    $accountLines = $whoamiOutput | Select-String -Pattern 'email|account' -SimpleMatch:$false -CaseSensitive:$false | Select-Object -First 2
    if ($accountLines) {
        $accountLines | ForEach-Object { Write-Host $_.Line }
    }
}

# ---------- Step 5: deploy ----------
Write-Step "Step 5 of 6  Deploy"
Write-Note "Running wrangler deploy ..."

$deployLog = New-TemporaryFile
try {
    # Use & with redirection. We need both visible output AND captured output.
    # Tee-Object is the PowerShell idiom for "show and save".
    & npx --no-install wrangler deploy 2>&1 | Tee-Object -FilePath $deployLog.FullName
    $deployStatus = $LASTEXITCODE

    if ($deployStatus -ne 0) {
        Write-Fail "wrangler deploy failed. See output above."
        exit 1
    }
    Write-Ok "wrangler deploy succeeded."

    # Extract workers.dev URL.
    $deployContent = Get-Content -Raw -LiteralPath $deployLog.FullName
    $match = [regex]::Match($deployContent, 'https://[a-zA-Z0-9._-]+\.workers\.dev')
    if ($match.Success) {
        $WorkerUrl = $match.Value
    } else {
        Write-Warn2 "Could not auto-detect workers.dev URL from output."
        $WorkerUrl = "https://pharmax-pricing-index.<account>.workers.dev"
    }
} finally {
    Remove-Item -LiteralPath $deployLog.FullName -ErrorAction SilentlyContinue
}

# ---------- Step 6: next steps ----------
Write-Step "Step 6 of 6  Next steps"

Write-Host ""
Write-Host "Deploy complete."
Write-Host ""
Write-Host "Worker URL:    $WorkerUrl"
Write-Host "Target domain: https://mcp.pharmax-ai.com"
Write-Host ""
Write-Host "1. Smoke test the workers.dev URL (works immediately):"
Write-Host ""
Write-Host "    curl $WorkerUrl/healthz"
Write-Host "    curl $WorkerUrl/.well-known/mcp.json"
Write-Host ""
Write-Host "2. Attach the custom domain mcp.pharmax-ai.com (one-time, browser step):"
Write-Host ""
Write-Host "    a) Open https://dash.cloudflare.com"
Write-Host "    b) Select the pharmax-ai.com zone."
Write-Host "    c) Workers and Pages, then click pharmax-pricing-index."
Write-Host "    d) Settings, Triggers, Custom Domains, Add Custom Domain."
Write-Host "    e) Enter: mcp.pharmax-ai.com"
Write-Host "    f) Cloudflare auto-creates the proxied record. DNS propagation: 1-5 min."
Write-Host ""
Write-Host "3. Uncomment the routes block in wrangler.toml"
Write-Host ""
Write-Host "    Then re-run: .\scripts\deploy.ps1"
Write-Host ""
Write-Host "4. Run verification once mcp.pharmax-ai.com resolves:"
Write-Host ""
Write-Host "    .\scripts\verify.ps1"
Write-Host ""
Write-Host "5. Submit to the 3 MCP directories:"
Write-Host ""
Write-Host "    npx tsx scripts\submit-directories.ts"
Write-Host ""
Write-Host "    Submission text lives in DIRECTORIES.md. The script reads from it,"
Write-Host "    so any edits there flow through."
Write-Host ""
Write-Host "    Directories:"
Write-Host "      - https://mcp.directory/submit"
Write-Host "      - https://smithery.ai/new"
Write-Host "      - https://glama.ai/mcp/submit"
Write-Host ""

Write-Ok "Done."
