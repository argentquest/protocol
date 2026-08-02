[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$requiredPorts = 4173, 5173

function Get-PortOwner {
  param(
    [Parameter(Mandatory)]
    [int]$Port
  )

  $connection = Get-NetTCPConnection `
    -State Listen `
    -LocalPort $Port `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return $null
  }

  $process = Get-CimInstance `
    -ClassName Win32_Process `
    -Filter "ProcessId=$($connection.OwningProcess)" `
    -ErrorAction SilentlyContinue
  [pscustomobject]@{
    Port = $Port
    ProcessId = $connection.OwningProcess
    CommandLine = $process.CommandLine
  }
}

try {
  Set-Location -LiteralPath $repositoryRoot

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not installed or is not available on PATH.'
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm is not installed or is not available on PATH.'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'node_modules'))) {
    throw 'Dependencies are not installed. Run "npm install" once, then start again.'
  }

  $owners = @($requiredPorts | ForEach-Object { Get-PortOwner -Port $_ }) |
    Where-Object { $_ }
  if ($owners.Count -gt 0) {
    $details = $owners |
      ForEach-Object { "port $($_.Port) (PID $($_.ProcessId)): $($_.CommandLine)" }
    throw "A Path Protocol port is already in use:`n$($details -join "`n")`nStop the old development session and run this launcher again."
  }

  Write-Host 'Starting Path Protocol frontend and API server...' -ForegroundColor Cyan
  Write-Host 'Open http://localhost:5173 after Vite reports that it is ready.'
  Write-Host 'Press Ctrl+C once to stop both processes.'
  & npm.cmd run dev
  if ($LASTEXITCODE -ne 0) {
    throw "The development processes exited with code $LASTEXITCODE."
  }
} catch {
  Write-Host ''
  Write-Error $_.Exception.Message
  exit 1
} finally {
  Set-Location -LiteralPath $repositoryRoot
}
