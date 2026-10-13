param(
  [ValidateSet('zero', 'account', 'author')][string]$Mode = 'zero',
  [ValidateSet('root-default', 'empty-version', 'denied', 'missing-owner', 'root-fallback')][string]$Variant = 'root-default',
  [string]$Out,
  [string]$AccountBoundary,
  [string]$ProgramFile,
  [string]$Previous,
  [ValidateSet('full', 'compact')][string]$ProgramContext = 'full'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if (-not $Out) { $Out = Join-Path $repo ('results/local-download/' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')) }
$Out = [IO.Path]::GetFullPath($Out)
[IO.Directory]::CreateDirectory($Out) | Out-Null
$command = @('src/index.ts', 'authorization', 'inquiry')
if ($Mode -eq 'zero') { $command += 'check' } else { $command += 'run' }
$command += @("--input=$PSScriptRoot/inputs/$Variant.json", '--strategy=question-checked-v1', '--execution-policy=progressive', "--program-context=$ProgramContext", "--out=$Out")
if ($Mode -eq 'author') {
  if ($ProgramFile) { throw 'Author mode starts without a supplied program; use -Previous for a saved author session.' }
  $command += '--program-mode=edit'
} else {
  if (-not $ProgramFile) { $ProgramFile = Join-Path $repo 'results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/authoring/automatic-program.json' }
  $ProgramFile = (Resolve-Path -LiteralPath $ProgramFile).Path
  $command += @("--domain-program=$ProgramFile", '--program-mode=consume')
}
if ($Previous) {
  if ($Mode -eq 'zero') { throw '-Previous is for a model session; zero mode recomputes the supplied program directly.' }
  $command += "--previous=$([IO.Path]::GetFullPath($Previous))"
}
if ($Mode -ne 'zero') {
  if (-not $AccountBoundary) { $AccountBoundary = Join-Path $repo 'results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/account-boundary.json' }
  $skill = Join-Path $repo 'results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md'
  $command += @('--harness=codex-account', '--model=gpt-5.6-sol', "--account-boundary=$AccountBoundary", "--skill=$skill", '--max-tool-calls=64', '--max-display-bytes=786432', '--max-read-bytes=33554432', '--session-timeout-ms=2700000')
}
Push-Location $repo
try {
  $output = & bun @command
  $code = $LASTEXITCODE
  [IO.File]::WriteAllText((Join-Path $Out 'command-result.json'), ($output -join "`n"), [Text.UTF8Encoding]::new($false))
  if ($code -ne 0) { Write-Error "Execution did not complete. Inspect $Out/command-result.json; do not automatically resend." -ErrorAction Continue; exit $code }
  $result = ($output -join "`n") | ConvertFrom-Json
  Write-Output "Session: $($result.sessionPath)"
  Write-Output "Steps: $($result.sessionPath)/execution.md"
  if ($ProgramFile) { Write-Output "Program: $ProgramFile" }
  $execution = if ($Mode -eq 'zero') { $result.executableContract.resourceExecution } else { $result.domain.executableContract.resourceExecution }
  $execution | Select-Object status, returned, termination, gaps | ConvertTo-Json -Depth 8
  if ($Mode -eq 'author' -and -not $execution) {
    Write-Output "No active resource execution. Raw draft and remaining original duties are retained in execution.json/md."
  }
  if ($Mode -ne 'zero') { Write-Output $result.telemetry.account.text }
} finally { Pop-Location }
