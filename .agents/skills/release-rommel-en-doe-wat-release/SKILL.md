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
3. Preserve unrelated marketing-repo edits. Only stage `downloads/Rommel-en-doe-wat-Setup.exe`.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Geert\Projects\rommel-en-doe-wat-2\.agents\skills\release-rommel-en-doe-wat-release\scripts\release-rommel-en-doe-wat.ps1
```

5. Use flags only for debugging:
   - `-NoCommit`: build and copy, skip git commit
   - `-SkipChecks`: skip `npm run check`
   - `-SkipBuild`: skip `npm run dist:win`
   - `-TargetPath <path>`: copy somewhere else; combine with `-NoCommit`
6. Verify the copied installer exists and report the marketing commit hash/message and push target when a commit is created.
7. Push the marketing repo immediately after the installer commit. Do not leave release commits unpushed.
