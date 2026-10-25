# Frame Builder development handoff

## Active checkpoint 3.51.10 (2026-10-25)
- 3.51.9 is an immutable prerelease at 7049e6e436e6562938588729566b01bdc795012e. Its native hosted install, lock wait, Unicode filename, cross-volume cleanup and interrupted-launch rollback passed in run 40180699416.
- Actual UI download from 3.51.8 succeeded, but its legacy PowerShell helper exited before preparation. The old window and executable stayed unchanged. Do not call that update path successful.
- 3.51.10 captures helper stdout/stderr in app-owned per-user logs, launches the explicit Windows PowerShell path, and requires full hosted testing from corrected 3.51.9. It remains a candidate until all release gates pass.
- Earlier checkpoint notes below are historical and contain obsolete pending-release statements. Replace them with a verified final handoff after release validation.

## Final verification checkpoint (2026-10-25)
- Corrected application source 7049e6e436e6562938588729566b01bdc795012e includes UTF-8 installer paths, .NET hashing and native PowerShell module precedence. App title now shows desktop 3.51.9.
- The file-lock test driver must close the old window without waiting for the test's deliberately held lock. The helper itself waits for unlock; the driver releases its lock after checking that no replacement occurred. This is a test sequencing fix, not a change to application behavior.
- Release workflows can resume verification of existing assets only when all runtime, CAD, assets and package/build identity source matches the immutable release tag. Existing assets and tags are never replaced or rebuilt. This allows verification-script repairs without changing an already published binary.
- Still require native hosted install/rollback and actual UI update success before stable delivery.

## Earlier installer checkpoint (2026-10-25)
- 3.51.8 release workflow failed safely before replacement: inherited PowerShell 7 module paths hid Windows PowerShell Get-FileHash. It remains a prerelease. 3.51.9 publication run 40178577749 was cancelled before publication, so its version remains unused.
- Native negative-control diagnosis run 40178833753 reproduced the missing hashing command. Corrected native probe run 40178981099 passed with .NET SHA-256, Windows native module discovery, UTF-8 job decoding and an accented filename. Its deliberate preflight cancellation left the target unchanged.
- 3.51.9 must still pass full hosted download/install/rollback and actual UI update checks before stable delivery.
- For previous 3.51.8 GUI testing, the driver launches with Explorer-equivalent native Windows module precedence. The new helper itself normalizes its inherited module path and uses .NET hashing, so it also supports launch from PowerShell 7.
- Native frame/export tests still run on each source CI. Production five/two-minute timing tests can be reused only when the immediate parent CI passed and all app code except the installer, CAD/browser source, assets and package metadata are unchanged. Otherwise the complete real timer suite runs.

## Earlier 3.51.9 verification plan (2026-10-25)
- 3.51.7 prerelease publication succeeded in run 40177181420. 3.51.8 exact-source Windows CI succeeded in run 40177726822 on commit 8c473e7d4df93bb8f211af2c3182c3bf3f519d98. Its hosted update workflow 40177727938 is still in progress.
- Final candidate 3.51.9 makes PowerShell 5.1 job-file decoding explicitly UTF-8 and tests an accented custom executable filename. It also gives the generated desktop HTML the actual package version in its title. Source browser/CAD geometry remains 3.51.6.
- 3.51.9 must verify an actual hosted update from 3.51.8 before becoming the delivered stable build. Do not overwrite any existing published version.

## Earlier release verification plan (2026-10-25)
- 3.51.8 is the follow-up candidate for full 3.51.7-to-3.51.8 verification. 3.51.7 initial prerelease workflow: https://github.com/TechSavage1989/Frame-Builder/actions/runs/40177181420. Do not call either release stable before its workflow succeeds.
- Windows run 40176816045 passed the native integration step: all four frame styles, spring toggle, active export guard, detachable viewer, STL/STEP/3MF saving, real two-minute focus return and real five-minute background timer. Its final build/smoke status must still be checked.
- 3.51.8 release gating now reuses green CI for the exact commit instead of repeating the five-minute native suite. It publishes an immutable prerelease, verifies hosted hashes, runs native replacement/lock/rollback tests, promotes it, and checks the actual previous portable application's update controls. An unsuccessful final UI check demotes the release again.
- Stable-named Frame Builder.exe is included in the Windows ZIP. An additional versioned EXE remains the updater asset.
- Local CAD regressions passed: all frame section choices, 13 spring/legacy cases and 15 reserved-bed safeguards. No CAD source or standalone HTML changed.

## Completed source audit (2026-10-25)
- Unpublished 3.51.7 candidate now preserves validated ETags across errors and process restarts, persists rate-limit backoff, runs main-process checks even while unfocused, and binds the two-minute focus policy to the actual window.
- Downloads and installs are single-flight. Windows PE, exact release filename/version, product metadata, byte length and SHA-256 are checked. Portable NSIS launchers may be x86 containers carrying the x64 application.
- Installer now supports Windows PowerShell 5.1, validates/stages before the old window closes, uses same-volume File.Replace, and requires a responsive visible new window plus ready CAD preview. It restarts/restores the previous executable on failures.
- Transaction cleanup waits for helper exit. One rollback EXE remains under per-user updates; transient staging beside the target is removed only after verified success/rollback. Custom executable names and shortcuts keep their target.
- CAD source and standalone browser 3.51.6 are unchanged. No rejected Borderless fold-flat design was imported.
- 22 local source tests pass, including a negative control for the candidate's ETag-after-error failure. Actual production two/five-minute window timer and all-style preview/export checks are implemented in scripts/native-integration.cjs and must pass on hosted Windows before release.
- Local Linux Electron cannot create a usable display in this environment. Do not count that as a Windows failure or a successful native test.
- No release has yet been published. Continue native CI and complete two-version update/rollback validation before marking the candidate ready.

## Prior verified state (2026-10-25)
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
