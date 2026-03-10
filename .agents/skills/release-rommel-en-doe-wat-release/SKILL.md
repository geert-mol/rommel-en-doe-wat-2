---
name: release-rommel-en-doe-wat-release
description: Build and publish the Windows installer for Rommel en doe wat. Use when asked to release the desktop app, rebuild the Windows package, or publish/update the GitHub Release assets used by auto-update and the marketing site download link.
---

# Release Rommel En Doe Wat

Use fixed paths:

- App repo: `C:\Users\Geert\Projects\rommel-en-doe-wat-2`
- Stable release asset alias: `release\Rommel-en-doe-wat-Setup.exe`

Workflow:

1. Check app repo with `git status --short`.
2. Stop and ask before releasing from unexpected dirty app source changes. Ignore generated build output changes only.
3. Release script auto-bumps semver before build:
   - `major` if commits since last `v*` tag contain `BREAKING CHANGE:` or `type!:` conventional commits
   - `minor` if commits since last `v*` tag include any `feat:`
   - otherwise `patch`
   - if no prior `v*` tag exists yet, default to `patch`
4. Script also commits and pushes the app repo version bump (`package.json`, `package-lock.json`), creates/pushes tag `v<version>`, and publishes the updater assets to the GitHub Release for that tag:
   - `latest.yml`
   - NSIS installer
   - stable installer alias `Rommel-en-doe-wat-Setup.exe`
   - NSIS blockmap
   - portable `.exe`
   - generated GitHub Release notes based on conventional commits since the previous `v*` tag
5. Marketing site download now points at `https://github.com/geert-mol/rommel-en-doe-wat-2/releases/latest/download/Rommel-en-doe-wat-Setup.exe`, so release no longer commits the binary into the marketing repo.
6. Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Geert\Projects\rommel-en-doe-wat-2\.agents\skills\release-rommel-en-doe-wat-release\scripts\release-rommel-en-doe-wat.ps1
```

7. Use flags only for debugging:
   - `-NoCommit`: build only, skip git commit/tag/release
   - `-SkipChecks`: skip `npm run check`
   - `-SkipBuild`: skip `npm run dist:win`
   - `-TargetPath <path>`: optional extra local copy target
8. Verify the published assets and report:
   - app repo version bump commit/tag/push target
   - GitHub Release tag/assets published
   - installer file size/timestamp
