[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$siteRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$serverPath = Join-Path $siteRoot 'server.mjs'
$logRoot = Join-Path $siteRoot 'logs'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
    throw "Website server not found: $serverPath"
}

function Test-LauncherWebsite {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/health' -TimeoutSec 3
        return $health.status -eq 'ok'
    } catch {
        return $false
    }
}

if (Test-LauncherWebsite) {
    Write-Output 'Arma Reforger Launcher website is already running.'
    exit 0
}

$listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port 4173 is already occupied by PID $($listener.OwningProcess)."
}

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$process = Start-Process -FilePath $nodePath `
    -ArgumentList "`"$serverPath`"" `
    -WorkingDirectory $siteRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logRoot 'website.stdout.log') `
    -RedirectStandardError (Join-Path $logRoot 'website.stderr.log') `
    -PassThru

Start-Sleep -Seconds 2
if ($process.HasExited -or -not (Test-LauncherWebsite)) {
    $details = Get-Content -LiteralPath (Join-Path $logRoot 'website.stderr.log') -Raw -ErrorAction SilentlyContinue
    throw "Website failed to start. $details"
}

Write-Output "Arma Reforger Launcher website started (PID $($process.Id))."
