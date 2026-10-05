param([string]$Goal, [string[]]$Steps)

$ErrorActionPreference = 'Continue'
$gateCommon = Join-Path $PSScriptRoot '..\Tools\Gates\GateCommon.ps1'
if (-not (Test-Path -LiteralPath $gateCommon)) {
    Write-Host "GATE: FAILED (the Tools repository must be cloned beside this one: $gateCommon)"
    exit 1
}
. $gateCommon

Register-GateSteps @('node_modules install markers', 'npm run lint', 'npm run build', 'npm test', 'SonarCloud analysis',
    'Fail on open Sonar issues')
Register-StepInputs @{
    'node_modules install markers' = @('package.json', 'package-lock.json', 'gate.ps1')
    'npm run lint'                 = @('*')
    'npm run build'                = @('*')
    'npm test'                     = @('*')
    'SonarCloud analysis'          = @('*')
    'Fail on open Sonar issues'    = @('*')
}
$repo = $PSScriptRoot
$sonarBranch = "branch-local-$($env:COMPUTERNAME.ToLowerInvariant())"
$sonarStep = "SonarCloud analysis (sonar-scanner, branch $sonarBranch, quality gate waited)"
$sonarIssues = 'Fail on open Sonar issues'
$env:TZ = 'UTC'
$env:CI = 'true'
if ($env:TZ -ne 'UTC') { Write-Host 'GATE: FAILED (TZ pin)'; exit 1 }
Set-Location $repo
Initialize-GateState 'Modules' $repo
Assert-RequestedSteps $Steps
Invoke-CatalogSteps

$installed = (Test-Path (Join-Path $repo 'node_modules\.package-lock.json')) -and
    (Test-Path (Join-Path $repo 'node_modules\.bin\tsc.cmd'))
if (-not $installed) { Stop-Gate 'node_modules install markers' 'incomplete install; run npm ci deliberately first' }
Write-Row 'node_modules install markers' 'PASS' '.package-lock.json, tsc.cmd present'

if (-not (Test-StepCarried 'npm run lint')) {
    $global:LASTEXITCODE = $null
    npm run lint
    $null = Test-Exit 'npm run lint'
}

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

if (Test-StepCarried $sonarIssues) {
    $null = Test-StepCarried $sonarStep
}
else {
    $sonarStartedAt = [DateTimeOffset]::UtcNow
    $env:JAVA_HOME = "$env:SystemDrive\sonar-scanner-8.0.1.6346-windows-x64\jre"
    $global:LASTEXITCODE = $null
    sonar-scanner -D"sonar.projectKey=crgolden_Modules" -D"sonar.organization=crgolden" -D"sonar.host.url=https://sonarcloud.io" -D"sonar.exclusions=**/node_modules/**,**/*.d.ts,dist/**,dist-test/**" -D"sonar.test.inclusions=**/*.test.ts" -D"sonar.javascript.lcov.reportPaths=coverage/lcov.info" -D"sonar.scanner.skipJreProvisioning=true" -D"sonar.qualitygate.wait=true" -D"sonar.branch.name=$sonarBranch"
    $null = Test-Exit $sonarStep
    Test-SonarIssues $sonarIssues 'crgolden_Modules' $sonarBranch $sonarStartedAt
}

Write-Row 'Publish when the version is new' 'NOT RUN' 'delivery step, not a check'
Complete-Gate
