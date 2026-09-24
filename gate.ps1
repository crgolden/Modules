param([string]$Goal)

$ErrorActionPreference = 'Continue'
$gateCommon = Join-Path $PSScriptRoot '..\Tools\Gates\GateCommon.ps1'
if (-not (Test-Path -LiteralPath $gateCommon)) {
    Write-Host "GATE: FAILED (the Tools repository must be cloned beside this one: $gateCommon)"
    exit 1
}
. $gateCommon

Register-GateSteps @('node_modules install markers', 'npm run build', 'npm test')
$repo = $PSScriptRoot
$env:TZ = 'UTC'
$env:CI = 'true'
if ($env:TZ -ne 'UTC') { Write-Host 'GATE: FAILED (TZ pin)'; exit 1 }
Set-Location $repo
Initialize-GateState 'Modules' $repo

$installed = (Test-Path (Join-Path $repo 'node_modules\.package-lock.json')) -and
    (Test-Path (Join-Path $repo 'node_modules\.bin\tsc.cmd'))
if (-not $installed) { Stop-Gate 'node_modules install markers' 'incomplete install; run npm ci deliberately first' }
Write-Row 'node_modules install markers' 'PASS' '.package-lock.json, tsc.cmd present'

if (-not (Test-StepCarried 'npm run build')) {
    $global:LASTEXITCODE = $null
    npm run build
    $null = Test-Exit 'npm run build'
}

if (-not (Test-StepCarried 'npm test')) {
    $global:LASTEXITCODE = $null
    npm test
    $null = Test-Exit 'npm test'
}

Write-Row 'Publish when the version is new' 'NOT RUN' 'delivery step, not a check'
Complete-Gate
