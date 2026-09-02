[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    Write-Output 'Arma Reforger Launcher website is not running.'
    exit 0
}

$process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
if ($process.ProcessName -ne 'node') {
    throw "Port 4173 belongs to an unexpected process: $($process.ProcessName)."
}

Stop-Process -Id $process.Id
Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
Write-Output 'Arma Reforger Launcher website stopped.'
