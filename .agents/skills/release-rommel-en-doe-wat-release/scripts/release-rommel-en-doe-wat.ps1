[CmdletBinding()]
param(
  [switch]$SkipChecks,
  [switch]$SkipBuild,
  [switch]$NoCommit,
  [string]$TargetPath = "C:\Users\Geert\Projects\rommel-en-doe-wat-marketing\downloads\Rommel-en-doe-wat-Setup.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AppRepo = "C:\Users\Geert\Projects\rommel-en-doe-wat-2"
$MarketingRepo = "C:\Users\Geert\Projects\rommel-en-doe-wat-marketing"
$DefaultTargetPath = "C:\Users\Geert\Projects\rommel-en-doe-wat-marketing\downloads\Rommel-en-doe-wat-Setup.exe"
$TrackedInstallerPath = "downloads/Rommel-en-doe-wat-Setup.exe"
$RemoteName = "origin"

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
    [string[]]$Arguments = @()
  )

  Push-Location $WorkingDirectory
  try {
    $output = & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
    return @($output)
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path $AppRepo -PathType Container)) {
  throw "App repo not found: $AppRepo"
}

if (-not (Test-Path $MarketingRepo -PathType Container)) {
  throw "Marketing repo not found: $MarketingRepo"
}

$packageJsonPath = Join-Path $AppRepo "package.json"
$packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not read version from $packageJsonPath"
}

$sourceInstaller = Join-Path $AppRepo ("release\Rommel en doe wat Setup {0}.exe" -f $version)
$resolvedTargetPath = [System.IO.Path]::GetFullPath($TargetPath)

if (-not $SkipChecks) {
  Invoke-External -WorkingDirectory $AppRepo -Command "npm.cmd" -Arguments @("run", "check")
}

if (-not $SkipBuild) {
  Invoke-External -WorkingDirectory $AppRepo -Command "npm.cmd" -Arguments @("run", "dist:win")
}

if (-not (Test-Path $sourceInstaller -PathType Leaf)) {
  throw "Installer not found after build: $sourceInstaller"
}

$targetDirectory = Split-Path -Parent $resolvedTargetPath
if (-not (Test-Path $targetDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $targetDirectory | Out-Null
}

Copy-Item -Path $sourceInstaller -Destination $resolvedTargetPath -Force
Write-Host "Copied installer to $resolvedTargetPath"

if ($NoCommit) {
  Write-Host "Skipping marketing repo commit."
  exit 0
}

if ($resolvedTargetPath -ne $DefaultTargetPath) {
  throw "Custom TargetPath requires -NoCommit."
}

$stagedNames = Get-ExternalOutput -WorkingDirectory $MarketingRepo -Command "git" -Arguments @("diff", "--cached", "--name-only")
$foreignStagedNames = @($stagedNames | Where-Object { $_ -and $_ -ne $TrackedInstallerPath })
if ($foreignStagedNames.Count -gt 0) {
  throw "Marketing repo has staged changes outside ${TrackedInstallerPath}: $($foreignStagedNames -join ', ')"
}

Invoke-External -WorkingDirectory $MarketingRepo -Command "git" -Arguments @("add", "--", $TrackedInstallerPath)

Push-Location $MarketingRepo
try {
  & git diff --cached --quiet -- $TrackedInstallerPath
  if ($LASTEXITCODE -gt 1) {
    throw "git diff --cached failed with exit code $LASTEXITCODE"
  }
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No installer changes to commit."
    exit 0
  }

  $commitMessage = "chore: update windows installer to v$version"
  & git commit -m $commitMessage -- $TrackedInstallerPath
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed with exit code $LASTEXITCODE"
  }

  $commitHash = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse HEAD failed with exit code $LASTEXITCODE"
  }

  $branchName = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "git branch --show-current failed with exit code $LASTEXITCODE"
  }
  if ([string]::IsNullOrWhiteSpace($branchName)) {
    throw "Could not determine current marketing branch for push."
  }

  & git push $RemoteName $branchName
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed with exit code $LASTEXITCODE"
  }

  Write-Host ("Created and pushed marketing commit {0} ({1}) to {2}/{3}" -f $commitHash, $commitMessage, $RemoteName, $branchName)
}
finally {
  Pop-Location
}
