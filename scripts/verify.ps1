# pharmax-pricing-index post-deploy verification (PowerShell 5.1+ / pwsh 7+)
#
# Tries mcp.pharmax-ai.com first. Falls back to *.workers.dev if custom
# domain not yet wired.
#
# Exit code 0 only if all checks pass.
#
# Usage:
#   .\scripts\verify.ps1
#   .\scripts\verify.ps1 -WorkersDevUrl https://pharmax-pricing-index.acct.workers.dev
#   .\scripts\verify.ps1 -BaseUrl https://mcp.pharmax-ai.com

# PSScriptAnalyzer: Write-Host is the correct tool for interactive verification
# output (visible regardless of caller's $InformationPreference).
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Interactive CLI script.')]
param(
    [string]$BaseUrl       = "",
    [string]$WorkersDevUrl = ""
)

# Important: we DO want to handle non-2xx responses ourselves, not let
# Invoke-WebRequest throw. So leave ErrorActionPreference alone and use try/catch.

$PrimaryBase = "https://mcp.pharmax-ai.com"

function Write-Pass { param([string]$M) Write-Host "[PASS] $M" -ForegroundColor Green; $script:Pass++ }
function Write-Fail2 { param([string]$M) Write-Host "[FAIL] $M" -ForegroundColor Red;   $script:Fail++ }
function Write-Info { param([string]$M) Write-Host "[info] $M" -ForegroundColor Cyan }
function Write-Warn3 { param([string]$M) Write-Host "[warn] $M" -ForegroundColor Yellow }

$script:Pass = 0
$script:Fail = 0

# Helper: Try an HTTP request, return (StatusCode, Body, Headers) without throwing.
function Invoke-Probe {
    param(
        [string]$Url,
        [string]$Method = 'GET',
        [string]$Body = $null,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 8
    )
    $result = [PSCustomObject]@{
        StatusCode = 0
        Body       = ''
        Headers    = @{}
        Error      = ''
    }
    try {
        $params = @{
            Uri              = $Url
            Method           = $Method
            TimeoutSec       = $TimeoutSec
            UseBasicParsing  = $true
            ErrorAction      = 'Stop'
        }
        if ($Headers.Count -gt 0)            { $params.Headers = $Headers }
        if ($null -ne $Body -and $Body -ne '') { $params.Body = $Body }

        $resp = Invoke-WebRequest @params
        $result.StatusCode = [int]$resp.StatusCode
        $result.Body       = $resp.Content
        $result.Headers    = $resp.Headers
    } catch {
        # Pull status code out of the exception if available (4xx, 5xx).
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $result.StatusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $result.Body = $reader.ReadToEnd()
                    $reader.Dispose()
                }
            } catch {
                # Best-effort body read. If the stream is gone we keep the empty body
                # and rely on $result.StatusCode for the verdict.
                $result.Body = ''
            }
        }
        $result.Error = $_.Exception.Message
    }
    return $result
}

# --- Pick a base URL that actually resolves ---
$Base = $null

if ($BaseUrl) {
    Write-Info "Using override base: $BaseUrl"
    $Base = $BaseUrl
} else {
    Write-Info "Probing $PrimaryBase/healthz ..."
    $probe = Invoke-Probe -Url "$PrimaryBase/healthz" -TimeoutSec 8
    if ($probe.StatusCode -eq 200) {
        Write-Info "Custom domain is live."
        $Base = $PrimaryBase
    } else {
        Write-Warn3 "Custom domain not reachable (HTTP $($probe.StatusCode)). Falling back to workers.dev."
        if (-not $WorkersDevUrl) {
            $WorkersDevUrl = "https://pharmax-pricing-index.workers.dev"
            Write-Warn3 "No -WorkersDevUrl provided. Trying $WorkersDevUrl (this often fails because the subdomain includes your account name)."
        }
        $probe2 = Invoke-Probe -Url "$WorkersDevUrl/healthz" -TimeoutSec 8
        if ($probe2.StatusCode -eq 200) {
            Write-Info "workers.dev fallback reachable: $WorkersDevUrl"
            $Base = $WorkersDevUrl
        } else {
            Write-Fail2 "Neither $PrimaryBase nor $WorkersDevUrl is reachable."
            Write-Host ""
            Write-Host "If you've just deployed, give DNS 1-5 minutes."
            Write-Host "Otherwise pass the correct URL:"
            Write-Host "    .\scripts\verify.ps1 -WorkersDevUrl https://pharmax-pricing-index.<account>.workers.dev"
            exit 1
        }
    }
}

Write-Host ""
Write-Host ("== Verifying {0} ==" -f $Base) -ForegroundColor White
Write-Host ""

# --- Check 1: /healthz ---
$r = Invoke-Probe -Url "$Base/healthz"
if ($r.StatusCode -eq 200 -and $r.Body -match '"status"\s*:\s*"ok"') {
    Write-Pass "GET /healthz returned 200 and status:ok"
} else {
    Write-Fail2 ("GET /healthz: HTTP {0}, body: {1}" -f $r.StatusCode, $r.Body)
}

# --- Check 2: /openapi.json ---
$r = Invoke-Probe -Url "$Base/openapi.json"
if ($r.StatusCode -eq 200 -and $r.Body -match '"openapi"\s*:\s*"3\.1\.') {
    Write-Pass "GET /openapi.json returned 200 with OpenAPI 3.1 spec"
} else {
    Write-Fail2 ("GET /openapi.json: HTTP {0} (or missing 'openapi: 3.1.x' field)" -f $r.StatusCode)
}

# --- Check 3: POST /mcp initialize ---
$initBody = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify.ps1","version":"1.0.0"}}}'
$r = Invoke-Probe -Url "$Base/mcp" -Method POST -Body $initBody -Headers @{ 'Content-Type' = 'application/json' }
if ($r.StatusCode -eq 200 -and $r.Body -match '"protocolVersion"' -and $r.Body -match '"capabilities"') {
    Write-Pass "POST /mcp initialize returned protocolVersion + capabilities"
} else {
    Write-Fail2 ("POST /mcp initialize: HTTP {0} (missing protocolVersion or capabilities)" -f $r.StatusCode)
}

# --- Check 4: SSE headers on /mcp/sse ---
# We don't want to block waiting for stream content. Use a short timeout and only
# inspect headers + first chunk.
$sseHeaderOk     = $false
$sseStatus       = 0
$sseContentType  = ''
try {
    $req = [System.Net.HttpWebRequest]::Create("$Base/mcp/sse")
    $req.Method = 'GET'
    $req.Accept = 'text/event-stream'
    $req.Timeout = 5000
    $req.ReadWriteTimeout = 3000
    $req.AllowAutoRedirect = $true
    $resp = $req.GetResponse()
    $sseStatus = [int]([System.Net.HttpWebResponse]$resp).StatusCode
    $sseContentType = $resp.ContentType
    if ($sseStatus -eq 200 -and $sseContentType -match 'text/event-stream') {
        $sseHeaderOk = $true
    }
    $resp.Close()
} catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $sseStatus = [int]([System.Net.HttpWebResponse]$_.Exception.Response).StatusCode
        $sseContentType = $_.Exception.Response.ContentType
        # If we got headers back but the read timed out, that's still a successful header check.
        if ($sseStatus -eq 200 -and $sseContentType -match 'text/event-stream') {
            $sseHeaderOk = $true
        }
    }
} catch {
    # SSE probe is best-effort. Any failure here means $sseHeaderOk stays false
    # and the check is reported as a FAIL below with whatever status we captured.
    $sseHeaderOk = $false
}

if ($sseHeaderOk) {
    Write-Pass "GET /mcp/sse returned 200 with text/event-stream Content-Type"
} else {
    Write-Fail2 ("GET /mcp/sse: status {0}, content-type {1}" -f $sseStatus, $sseContentType)
}

# --- Check 5: tools/list returns 4 tools ---
$toolsBody = '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
$r = Invoke-Probe -Url "$Base/mcp" -Method POST -Body $toolsBody -Headers @{ 'Content-Type' = 'application/json' }

$expectedTools = @('search_price','list_category','get_oopi','get_disclosure_block')
$allPresent = $true
foreach ($t in $expectedTools) {
    if ($r.Body -notmatch [regex]::Escape("`"$t`"")) { $allPresent = $false; break }
}
$nameMatches = [regex]::Matches($r.Body, '"name"\s*:\s*"[a-z_]+"').Count

if ($r.StatusCode -eq 200 -and $allPresent -and $nameMatches -ge 4) {
    Write-Pass "POST /mcp tools/list returned 4 expected tools"
} else {
    Write-Fail2 ("POST /mcp tools/list: HTTP {0}, name-fields {1}, allPresent {2}" -f $r.StatusCode, $nameMatches, $allPresent)
}

# --- Summary ---
$total = $script:Pass + $script:Fail
Write-Host ""
Write-Host "== Summary ==" -ForegroundColor White
Write-Host "Base URL:  $Base"
Write-Host "Passed:    $($script:Pass)/$total"
Write-Host "Failed:    $($script:Fail)/$total"

if ($script:Fail -eq 0) {
    Write-Host "[OK] All checks passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] One or more checks failed." -ForegroundColor Red
    exit 1
}
