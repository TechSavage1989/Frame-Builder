# Frame Builder development handoff

## Current verified state (2026-10-25)
- Canonical repository: https://github.com/TechSavage1989/Frame-Builder, public, default branch main. Owner explicitly authorized public source and binaries.
- Last accepted COMPLETE Windows baseline: **Canvas Frame Builder 3.51.6**.
- Current updater source candidate: **3.51.7**. Do not confuse a built candidate with a fully tested updater release.
- Public source was imported in commit `4457d8110ef2d868f423c58823208679dddf190b`.
- Windows smoke test first failed on cross-platform test path expectations, then on a smoke-test AppData mismatch. Both were fixed.
- [CI run #40175655458](https://github.com/TechSavage1989/Frame-Builder/actions/runs/40175655458) **passed** on commit `d09de9f05efe81d627435ee5c23694590962fccd`: 16 Node tests, Windows EXE compilation, and packaged visible-window smoke.
- Run's downloadable artifact: `Frame-Builder-Windows-x64-Candidate`, GitHub artifact ID `12592310496`. This is a candidate, not a release; workflow retention is 14 days.
- GitHub Actions release process includes a manual `workflow_dispatch` option and intentionally creates a **pre-release** with EXE, manifest, and checksums. This manual release process has not yet run end to end.
- Check current main HEAD and latest hosted CI/release status again before any change. Do not assume these snapshot commit IDs are still HEAD.

## Preserved functional scope
- Original Snap, Top-Loading, Lightweight Adaptive Depth, Front Snap Borderless.
- Reinforced UV-printable panel joints, optional Front Snap rear-perimeter frame springs, precise panel thickness and flat artwork printing face.
- Automatic/manual frame sectioning, true centered braces, rear mounts, captured breakaway easel.
- Size adjustments, preview/3D viewer, STL/STEP/3MF, Bambu X1C cutter/calibration/exclusion zones.
- Last accepted baseline 3.51.6 is preserved in `browser/Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html`, and under `cad_source`. Do not replace it with rejected later fold-flat Borderless prototypes.
- Fusion 360 Builder 1.4.2 is a separate tool and not this repository's desktop app.

## Source, build and testing
- Node.js 22: `npm ci`; `npm run check`; `npm run build:windows`. Windows shortcut: `Build_Windows.cmd`.
- Desktop code: `app/main.cjs`, `app/preload.cjs`, `app/index.html`, `app/update-*.cjs`, `app/update-install.ps1`.
- CAD source and validation scripts: `cad_source`. Browser model: `browser`.
- CI workflow: `.github/workflows/ci.yml`; manual or tag-triggered prerelease: `.github/workflows/release.yml`.
- Native smoke test: `scripts/windows-smoke.ps1`, which uses Windows' actual Roaming AppData known-folder path for a strict nonce/version/window receipt. Do not override only APPDATA to fabricate a different path: Electron may use the actual Windows known folder.
- Standalone native integration test: `scripts/electron-smoke.cjs` (older test assumptions may require revision before relying on this).
- Negative timeout control: `node scripts/negative-control.cjs`. A historical bug used an undeclared timeout variable; the fixed updater reports an ordinary request failure.
- Do not treat unit/mocked validation as a successful installed update test.

## Identity, update feed, settings
- Public release/update repository: `TechSavage1989/Frame-Builder`.
- Release check feed: https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest
- Intended release tag: `v3.51.7` for candidate version 3.51.7. Never reuse an existing release tag.
- Release asset name: `Frame_Builder_3.51.7_Windows_x64.exe`; manifest: `update-manifest.json`; checksums: `SHA256SUMS.txt`.
- Product identity: `com.techsavage3d.canvasframe`. Stable installed filename: `Frame Builder.exe` or the user's existing executable name.
- Preserve per-user application storage in Windows Roaming AppData `Canvas Frame Builder`; updater data under its `updates` directory. Do not persist settings, logs, downloaded updates, or stage files next to the EXE.
- Only retain one previous executable rollback; never replace automatically without user action.
- The release pipeline verifies downloadable hosted EXE hash against the locally generated artifact, but this does not establish code signing.

## Publication workflow
1. Confirm newest main CI is green and download the candidate from its Artifacts.
2. Test the candidate on actual Windows: open app, all four frame styles, preview, STL/STEP/3MF exports, restore settings/shortcuts, check desktop icon, active operations and offline/rate-limit behavior.
3. Open GitHub Actions **Windows Release** and click **Run workflow** on main. The workflow creates a prerelease for the package version if that version/tag is unused.
4. Check release assets (EXE, manifest, SHA256SUMS.txt), tag and commit, and download hash. Do not call it stable yet.
5. For updater end-to-end testing, publish a second incremented update-capable version in the required feed and verify download, digest, same-volume staging, install, visible restart, settings, rollback, cleanup and browser focus/timers from previous build to newer build.
6. Only promote to stable after those checks succeed. Update this handoff with the exact version, tag, commit, CI run and hashes.

## Remaining limitations
- Manual release workflow has not yet been executed or its published assets verified.
- Windows packaged launch passed in hosted CI, but was not tested on the user's own Windows PC.
- There has been **no real previous-version-to-next-version updater installation and rollback test**.
- Local environment cannot download npm modules or test the Windows portable executable; GitHub Windows CI builds it.
- No code-signing certificate has been supplied. Matching SHA-256 is not publisher-signature verification.
- Public source is owner-approved, but a license is still unspecified; do not choose one without user authorization.
- No server, external agent, Codex automation, payment or API-account setup is in scope.
