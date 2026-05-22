# CAI™ Core — Windows Code-Signing Script
# BP051 NOVACULA · SEG-CC-6
#
# Status: CERT-PENDING
#   A valid Authenticode code-signing certificate (EV or OV) has not yet been acquired.
#   This script is structurally complete — fill in CERT_THUMBPRINT below when the cert
#   is in hand, then run from the repo root to sign the installer.
#
# Usage (after cert acquisition):
#   .\build-scripts\sign.ps1 -InstallerPath "release\CAI-Core-Setup-0.1.7.exe"
#
# Distribution: ONLY from https://mnemosynec.ai/download/ — no USB redistribution
#
# Signtool requirements:
#   - Windows SDK signtool.exe must be in PATH
#   - Certificate must be in Windows Certificate Store
#
# Timestamp URL options (RFC 3161):
#   http://timestamp.digicert.com
#   http://timestamp.sectigo.com

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,

    [string]$CertThumbprint = $env:CAI_CERT_THUMBPRINT,

    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

# ── CERT-PENDING guard ───────────────────────────────────────────────────────
if (-not $CertThumbprint) {
    Write-Warning "CERT-PENDING: No certificate thumbprint provided."
    Write-Warning "Set env var CAI_CERT_THUMBPRINT or pass -CertThumbprint."
    Write-Warning "Skipping signing step — installer will be UNSIGNED."
    exit 0
}

# ── Resolve signtool path ────────────────────────────────────────────────────
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
    $sdkPaths = @(
        "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
        "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe",
        "C:\Program Files (x86)\Microsoft SDKs\Windows\v10.0A\bin\NETFX 4.8 Tools\signtool.exe"
    )
    $signtoolPath = $sdkPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $signtoolPath) {
        Write-Error "signtool.exe not found. Install the Windows SDK."
        exit 1
    }
} else {
    $signtoolPath = $signtool.Path
}

# ── Validate installer path ──────────────────────────────────────────────────
if (-not (Test-Path $InstallerPath)) {
    Write-Error "Installer not found: $InstallerPath"
    exit 1
}

$absInstaller = Resolve-Path $InstallerPath

# ── Sign ─────────────────────────────────────────────────────────────────────
Write-Host "Signing: $absInstaller"
Write-Host "Timestamp URL: $TimestampUrl"

& $signtoolPath sign `
    /fd SHA256 `
    /sha1 $CertThumbprint `
    /tr $TimestampUrl `
    /td SHA256 `
    /d "CAI™ Core — Cooperative AI Memory Architecture" `
    /du "https://mnemosynec.ai" `
    "$absInstaller"

if ($LASTEXITCODE -ne 0) {
    Write-Error "signtool failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Signing complete."

# ── Verify ───────────────────────────────────────────────────────────────────
Write-Host "Verifying signature..."
& $signtoolPath verify /pa /v "$absInstaller"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Signature verification failed."
    exit $LASTEXITCODE
}

Write-Host "Signature verified OK."
