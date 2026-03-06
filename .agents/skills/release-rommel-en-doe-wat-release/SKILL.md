---
name: release-rommel-en-doe-wat-release
description: Build and publish the Windows installer for Rommel en doe wat. Use when asked to release the desktop app, rebuild the Windows package, copy the installer into C:\Users\Geert\Projects\rommel-en-doe-wat-marketing\downloads\Rommel-en-doe-wat-Setup.exe, and commit plus push the marketing repo after updating that download artifact.
---

# Release Rommel En Doe Wat

Use fixed paths:

- App repo: `C:\Users\Geert\Projects\rommel-en-doe-wat-2`
- Marketing repo: `C:\Users\Geert\Projects\rommel-en-doe-wat-marketing`
- Published installer: `C:\Users\Geert\Projects\rommel-en-doe-wat-marketing\downloads\Rommel-en-doe-wat-Setup.exe`

Workflow:

1. Check both repos with `git status --short`.
2. Stop and ask before releasing from unexpected dirty app source changes. Ignore generated build output changes only.
3. Release script auto-bumps semver before build:
   - `major` if commits since last `v*` tag contain `BREAKING CHANGE:` or `type!:` conventional commits
   - `minor` if commits since last `v*` tag include any `feat:`
   - otherwise `patch`
   - if no prior `v*` tag exists yet, default to `patch`
4. Script also commits and pushes the app repo version bump (`package.json`, `package-lock.json`) and creates/pushes tag `v<version>`.
5. Preserve unrelated marketing-repo edits. Only stage `downloads/Rommel-en-doe-wat-Setup.exe`.
6. Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Geert\Projects\rommel-en-doe-wat-2\.agents\skills\release-rommel-en-doe-wat-release\scripts\release-rommel-en-doe-wat.ps1
```

7. Use flags only for debugging:
   - `-NoCommit`: build and copy, skip git commit
   - `-SkipChecks`: skip `npm run check`
   - `-SkipBuild`: skip `npm run dist:win`
   - `-TargetPath <path>`: copy somewhere else; combine with `-NoCommit`
8. Verify the copied installer exists and report:
   - app repo version bump commit/tag/push target
   - marketing commit hash/message/push target
9. Push the marketing repo immediately after the installer commit. Do not leave release commits unpushed.
