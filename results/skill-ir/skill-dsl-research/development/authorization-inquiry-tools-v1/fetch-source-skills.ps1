$ErrorActionPreference = 'Stop'
$sourceDestination = Join-Path $PSScriptRoot 'source-skills'
$sourceFamilies = @(
  @{ Id = 'cloudflare-security-audit'; Repo = 'cloudflare/security-audit-skill'; Ref = 'c1c8a8c1471069fb0e188eeaff69b8e8db6564a8'; Folder = 'skills/security-audit' },
  @{ Id = 'github-security-review'; Repo = 'github/awesome-copilot'; Ref = '7e375eac04fa04f291859ca962a4d8a3bb8b7564'; Folder = 'skills/security-review' }
)
foreach ($sourceFamily in $sourceFamilies) {
  $sourceRoot = Join-Path $sourceDestination $sourceFamily.Id
  if (Test-Path -LiteralPath (Join-Path $sourceRoot 'source.json')) { Write-Output "$($sourceFamily.Id): already fetched"; continue }
  $sourceTreeText = & gh api "repos/$($sourceFamily.Repo)/git/trees/$($sourceFamily.Ref)?recursive=1"
  if ($LASTEXITCODE -ne 0) { throw "Cannot fetch tree: $($sourceFamily.Id)" }
  $sourceTree = $sourceTreeText | ConvertFrom-Json
  if ($sourceTree.truncated) { throw 'Truncated source tree' }
  $sourceFiles = @($sourceTree.tree | Where-Object { $_.type -eq 'blob' -and ($_.path.StartsWith($sourceFamily.Folder + '/') -or $_.path -match '^LICENSE(\.md|\.txt)?$') })
  if (-not ($sourceFiles | Where-Object { $_.path -eq ($sourceFamily.Folder + '/SKILL.md') })) { throw 'Missing fixed source skill' }
  foreach ($sourceItem in $sourceFiles) {
    $sourceRelative = if ($sourceItem.path.StartsWith($sourceFamily.Folder + '/')) { $sourceItem.path.Substring($sourceFamily.Folder.Length + 1) } else { $sourceItem.path }
    $sourcePath = Join-Path $sourceRoot $sourceRelative
    New-Item -ItemType Directory -Path (Split-Path -Parent $sourcePath) -Force | Out-Null
    $sourceBlobText = & gh api "repos/$($sourceFamily.Repo)/git/blobs/$($sourceItem.sha)"
    if ($LASTEXITCODE -ne 0) { throw "Cannot fetch source blob: $sourceRelative" }
    $sourceBlob = $sourceBlobText | ConvertFrom-Json
    if ($sourceBlob.encoding -ne 'base64') { throw 'Unexpected source encoding' }
    [IO.File]::WriteAllBytes($sourcePath, [Convert]::FromBase64String($sourceBlob.content))
  }
  $sourceMetadata = @{ schemaVersion = 'authorization-ao-source-skill/v1'; id = $sourceFamily.Id; repository = $sourceFamily.Repo; sourceRef = $sourceFamily.Ref; sourceFolder = $sourceFamily.Folder; fetchedAt = [DateTime]::UtcNow.ToString('o'); files = $sourceFiles | Select-Object path, sha; targetExecutions = 0 }
  [IO.File]::WriteAllText((Join-Path $sourceRoot 'source.json'), ($sourceMetadata | ConvertTo-Json -Depth 6) + "`n", [Text.UTF8Encoding]::new($false))
  Write-Output "$($sourceFamily.Id): $($sourceFiles.Count) original files fetched at fixed ref"
}
