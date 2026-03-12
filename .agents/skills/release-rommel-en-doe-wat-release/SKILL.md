---
name: release-rommel-en-doe-wat-release
description: Build and publish the Windows installer for Rommel en doe wat. Use when asked to release the desktop app, rebuild the Windows package, or publish/update the GitHub Release assets used by auto-update and the marketing site download link.
---

# Release Rommel En Doe Wat

Workflow:

1. Check app repo with `git status --short`.
2. Script defaults:
   - detect app repo from the script location, so any local clone path works
   - detect GitHub release repo from `git remote get-url origin`
   - if the app repo has local non-generated source changes, create a source commit and push the branch before version bumping
   - if the branch is already clean, still push the current branch before version bumping
   - default source commit message: `chore: prepare release`
   - allow overrides with `-AppRepoPath <path>` and `-GitHubReleaseRepo <owner/repo>`
3. Release script auto-bumps semver before build:
   - `major` if commits since last `v*` tag contain `BREAKING CHANGE:` or `type!:` conventional commits
   - `minor` if commits since last `v*` tag include any `feat:`
   - otherwise `patch`
   - if no prior `v*` tag exists yet, default to `patch`
4. Source commit message affects semver and release notes:
   - default `chore: prepare release` leads to a `patch` bump
   - for feature or breaking releases, pass a conventional commit message with `-SourceCommitMessage`
5. Script also commits and pushes the app repo version bump (`package.json`, `package-lock.json`), creates/pushes tag `v<version>`, and publishes the updater assets to the GitHub Release for that tag:
   - `latest.yml`
   - NSIS installer
   - stable installer alias `Rommel-en-doe-wat-Setup.exe`
   - NSIS blockmap
   - portable `.exe`
   - generated GitHub Release notes based on conventional commits since the previous `v*` tag
6. Run from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\.agents\skills\release-rommel-en-doe-wat-release\scripts\release-rommel-en-doe-wat.ps1
```

7. Use flags only for debugging or overrides:
   - `-NoCommit`: build only, skip git commit/tag/release
   - `-SkipChecks`: skip `npm run check`
   - `-SkipBuild`: skip `npm run dist:win`
   - `-TargetPath <path>`: optional extra local copy target
   - `-AppRepoPath <path>`: optional explicit app repo path if script is copied outside the repo
   - `-GitHubReleaseRepo <owner/repo>`: optional explicit GitHub release target
   - `-SourceCommitMessage "type: summary"`: optional source commit message before release; use conventional commits for correct semver/release notes
8. Verify the published assets and report:
   - source commit/push target before release
   - app repo version bump commit/tag/push target
   - GitHub Release tag/assets published
   - installer file size/timestamp
