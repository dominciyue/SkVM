param(
  [ValidateSet('zero', 'account', 'author')][string]$Mode = 'zero',
  [ValidateSet('root-default', 'empty-version', 'denied', 'missing-owner', 'root-fallback')][string]$Variant = 'root-default',
  [string]$Out,
  [string]$AccountBoundary,
  [ValidateSet('full', 'compact')][string]$ProgramContext = 'compact'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if (-not $Out) { $Out = Join-Path $repo ('results/local-download/' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')) }
$Out = [IO.Path]::GetFullPath($Out)
[IO.Directory]::CreateDirectory($Out) | Out-Null
$command = @('src/index.ts', 'authorization', 'inquiry')
if ($Mode -eq 'zero') { $command += 'check' } else { $command += 'run' }
$command += @("--input=$PSScriptRoot/inputs/$Variant.json", '--strategy=question-checked-v1', '--execution-policy=progressive', "--program-context=$ProgramContext", "--out=$Out")
if ($Mode -eq 'author') { $command += '--program-mode=edit' } else { $command += @("--domain-program=$PSScriptRoot/program.json", '--program-mode=consume') }
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
  if ($code -ne 0) { throw "Execution did not complete. Inspect $Out/command-result.json; do not automatically resend." }
  $result = ($output -join "`n") | ConvertFrom-Json
  Write-Output "Session: $($result.sessionPath)"
  Write-Output "Steps: $($result.sessionPath)/execution.md"
  $execution = if ($Mode -eq 'zero') { $result.executableContract.resourceExecution } else { $result.domain.executableContract.resourceExecution }
  $execution | Select-Object status, returned, termination, gaps | ConvertTo-Json -Depth 8
  if ($Mode -ne 'zero') { Write-Output $result.telemetry.account.text }
} finally { Pop-Location }
