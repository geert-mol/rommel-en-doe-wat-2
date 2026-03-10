[CmdletBinding()]
param(
  [switch]$SkipChecks,
  [switch]$SkipBuild,
  [switch]$NoCommit,
  [string]$TargetPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AppRepo = "C:\Users\Geert\Projects\rommel-en-doe-wat-2"
$RemoteName = "origin"
$GitHubReleaseRepo = "geert-mol/rommel-en-doe-wat-2"
$VersionFiles = @("package.json", "package-lock.json")
$AllowedGeneratedPrefixes = @("coverage/", "dist/", "dist-electron/", "release/")

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @()
  )

  Push-Location $WorkingDirectory
  try {
    Write-Host ("[{0}] {1} {2}" -f (Split-Path -Leaf $WorkingDirectory), $Command, ($Arguments -join " "))
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
  }
  finally {
    Pop-Location
  }
}

function Get-ExternalOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @(),
    [switch]$AllowFailure
  )

  Push-Location $WorkingDirectory
  try {
    $output = & $Command @Arguments
    if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
    return @($output)
  }
  finally {
    Pop-Location
  }
}

function Get-RepoStatusLines {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory
  )

  return Get-ExternalOutput -WorkingDirectory $WorkingDirectory -Command "git" -Arguments @("status", "--short", "--untracked-files=all")
}

function Get-StatusPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StatusLine
  )

  if ($StatusLine.Length -lt 4) {
    return ""
  }

  $pathValue = $StatusLine.Substring(3).Trim()
  if ($pathValue.Contains(" -> ")) {
    return ($pathValue.Split(" -> ", 2)[1]).Trim()
  }

  return $pathValue
}

function Test-IsAllowedGeneratedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue
  )

  $normalized = $PathValue.Replace("\", "/")
  foreach ($prefix in $AllowedGeneratedPrefixes) {
    if ($normalized.StartsWith($prefix)) {
      return $true
    }
  }

  return $false
}

function Get-CurrentBranchName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory
  )

  $branchName = (Get-ExternalOutput -WorkingDirectory $WorkingDirectory -Command "git" -Arguments @("branch", "--show-current")) -join ""
  $branchName = $branchName.Trim()
  if ([string]::IsNullOrWhiteSpace($branchName)) {
    throw "Could not determine current branch in $WorkingDirectory"
  }

  return $branchName
}

function Publish-GitHubRelease {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TagName,
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [Parameter(Mandatory = $true)]
    [string]$NotesFilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$AssetPaths
  )

  $existingRelease = ((Get-ExternalOutput -WorkingDirectory $AppRepo -Command "gh" -Arguments @("release", "view", $TagName, "--repo", $GitHubReleaseRepo) -AllowFailure) -join "").Trim()
  if ([string]::IsNullOrWhiteSpace($existingRelease)) {
    Invoke-External -WorkingDirectory $AppRepo -Command "gh" -Arguments (
      @(
        "release",
        "create",
        $TagName,
        "--repo",
        $GitHubReleaseRepo,
        "--title",
        "v$Version",
        "--notes-file",
        $NotesFilePath
      ) + $AssetPaths
    )
    return
  }

  Invoke-External -WorkingDirectory $AppRepo -Command "gh" -Arguments @(
    "release",
    "edit",
    $TagName,
    "--repo",
    $GitHubReleaseRepo,
    "--title",
    "v$Version",
    "--notes-file",
    $NotesFilePath
  )

  Invoke-External -WorkingDirectory $AppRepo -Command "gh" -Arguments (
    @("release", "upload", $TagName, "--repo", $GitHubReleaseRepo, "--clobber") + $AssetPaths
  )
}

if (-not (Test-Path $AppRepo -PathType Container)) {
  throw "App repo not found: $AppRepo"
}

$appStatusLines = Get-RepoStatusLines -WorkingDirectory $AppRepo
$unexpectedAppChanges = @(
  $appStatusLines |
    Where-Object { $_ } |
    Where-Object {
      $statusPath = Get-StatusPath -StatusLine $_
      -not [string]::IsNullOrWhiteSpace($statusPath) -and -not (Test-IsAllowedGeneratedPath -PathValue $statusPath)
    }
)

if ($unexpectedAppChanges.Count -gt 0) {
  throw "App repo has unexpected source changes. Commit or stash before release: $($unexpectedAppChanges -join '; ')"
}

$resolvedTargetPath = ""
if (-not [string]::IsNullOrWhiteSpace($TargetPath)) {
  $resolvedTargetPath = [System.IO.Path]::GetFullPath($TargetPath)
}
$releaseTag = ((Get-ExternalOutput -WorkingDirectory $AppRepo -Command "git" -Arguments @("describe", "--tags", "--abbrev=0", "--match", "v*") -AllowFailure) -join "").Trim()
$commitLogFile = [System.IO.Path]::GetTempFileName()
$releaseNotesFile = [System.IO.Path]::GetTempFileName()

try {
  if ([string]::IsNullOrWhiteSpace($releaseTag)) {
    Set-Content -Path $commitLogFile -Value "" -NoNewline
  }
  else {
    $commitLog = Get-ExternalOutput -WorkingDirectory $AppRepo -Command "git" -Arguments @("log", "--format=%B%x1e", "$releaseTag..HEAD")
    [System.IO.File]::WriteAllText($commitLogFile, ($commitLog -join [Environment]::NewLine))
  }

  $versionPlanJson = (Get-ExternalOutput -WorkingDirectory $AppRepo -Command "node" -Arguments @("scripts/release-version.mjs", $commitLogFile)) -join [Environment]::NewLine
  $versionPlan = $versionPlanJson | ConvertFrom-Json
  $releaseNotes = (Get-ExternalOutput -WorkingDirectory $AppRepo -Command "node" -Arguments @("scripts/release-notes.mjs", $commitLogFile)) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText($releaseNotesFile, $releaseNotes)
}
finally {
  Remove-Item -Path $commitLogFile -Force -ErrorAction SilentlyContinue
}

$currentVersion = [string]$versionPlan.currentVersion
$bumpLevel = [string]$versionPlan.bumpLevel
$version = [string]$versionPlan.nextVersion

if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not determine next release version."
}

Write-Host ("Version bump: {0} -> {1} ({2})" -f $currentVersion, $version, $bumpLevel)
Invoke-External -WorkingDirectory $AppRepo -Command "npm.cmd" -Arguments @("version", $bumpLevel, "--no-git-tag-version")

$sourceInstaller = Join-Path $AppRepo ("release\Rommel-en-doe-wat-Setup-{0}.exe" -f $version)
$sourceInstallerBlockMap = Join-Path $AppRepo ("release\Rommel-en-doe-wat-Setup-{0}.exe.blockmap" -f $version)
$sourcePortable = Join-Path $AppRepo ("release\Rommel-en-doe-wat-{0}-Portable.exe" -f $version)
$sourceLatestManifest = Join-Path $AppRepo "release\latest.yml"
$sourceStableInstaller = Join-Path $AppRepo "release\Rommel-en-doe-wat-Setup.exe"

if (-not $SkipChecks) {
  Invoke-External -WorkingDirectory $AppRepo -Command "npm.cmd" -Arguments @("run", "check")
}

if (-not $SkipBuild) {
  Invoke-External -WorkingDirectory $AppRepo -Command "npm.cmd" -Arguments @("run", "dist:win")
}

if (-not (Test-Path $sourceInstaller -PathType Leaf)) {
  throw "Installer not found after build: $sourceInstaller"
}
if (-not (Test-Path $sourceInstallerBlockMap -PathType Leaf)) {
  throw "Installer blockmap not found after build: $sourceInstallerBlockMap"
}
if (-not (Test-Path $sourceLatestManifest -PathType Leaf)) {
  throw "Updater manifest not found after build: $sourceLatestManifest"
}
if (-not (Test-Path $sourcePortable -PathType Leaf)) {
  throw "Portable executable not found after build: $sourcePortable"
}

Copy-Item -Path $sourceInstaller -Destination $sourceStableInstaller -Force
Write-Host "Prepared stable installer alias at $sourceStableInstaller"

if (-not [string]::IsNullOrWhiteSpace($resolvedTargetPath)) {
  $targetDirectory = Split-Path -Parent $resolvedTargetPath
  if (-not (Test-Path $targetDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $targetDirectory | Out-Null
  }

  Copy-Item -Path $sourceInstaller -Destination $resolvedTargetPath -Force
  Write-Host "Copied installer to $resolvedTargetPath"
}

if ($NoCommit) {
  Write-Host "Skipping git commits. App repo version files remain updated locally."
  exit 0
}

$appBranchName = Get-CurrentBranchName -WorkingDirectory $AppRepo
$releaseTagName = "v$version"
$existingTag = ((Get-ExternalOutput -WorkingDirectory $AppRepo -Command "git" -Arguments @("tag", "--list", $releaseTagName)) -join "").Trim()
if ($existingTag -eq $releaseTagName) {
  throw "Release tag already exists: $releaseTagName"
}

$stagedAppNames = Get-ExternalOutput -WorkingDirectory $AppRepo -Command "git" -Arguments @("diff", "--cached", "--name-only")
$foreignAppStagedNames = @($stagedAppNames | Where-Object { $_ -and $_ -notin $VersionFiles })
if ($foreignAppStagedNames.Count -gt 0) {
  throw "App repo has staged changes outside version files: $($foreignAppStagedNames -join ', ')"
}

$addVersionArgs = @("add", "--") + $VersionFiles
Invoke-External -WorkingDirectory $AppRepo -Command "git" -Arguments $addVersionArgs

Push-Location $AppRepo
try {
  $diffArgs = @("diff", "--cached", "--quiet", "--") + $VersionFiles
  & git @diffArgs
  if ($LASTEXITCODE -gt 1) {
    throw "git diff --cached failed with exit code $LASTEXITCODE"
  }
  if ($LASTEXITCODE -eq 0) {
    throw "Version bump did not modify package files."
  }

  $appCommitMessage = "chore: release v$version"
  $commitArgs = @("commit", "-m", $appCommitMessage, "--") + $VersionFiles
  & git @commitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed with exit code $LASTEXITCODE"
  }

  & git tag $releaseTagName
  if ($LASTEXITCODE -ne 0) {
    throw "git tag failed with exit code $LASTEXITCODE"
  }

  & git push $RemoteName $appBranchName
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed with exit code $LASTEXITCODE"
  }

  & git push $RemoteName $releaseTagName
  if ($LASTEXITCODE -ne 0) {
    throw "git push tag failed with exit code $LASTEXITCODE"
  }

  Publish-GitHubRelease -TagName $releaseTagName -Version $version -AssetPaths @(
    $sourceInstaller,
    $sourceStableInstaller,
    $sourceInstallerBlockMap,
    $sourcePortable,
    $sourceLatestManifest
  ) -NotesFilePath $releaseNotesFile

  $appCommitHash = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse HEAD failed with exit code $LASTEXITCODE"
  }

  Write-Host ("Created and pushed app commit {0} ({1}) to {2}/{3}" -f $appCommitHash, $appCommitMessage, $RemoteName, $appBranchName)
}
finally {
  Pop-Location
  Remove-Item -Path $releaseNotesFile -Force -ErrorAction SilentlyContinue
}
