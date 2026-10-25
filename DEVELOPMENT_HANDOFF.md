# Frame Builder development handoff

## Verified repository state - 2026-10-25
- Main public repository: https://github.com/TechSavage1989/Frame-Builder, default branch main.
- User authorized public source and public releases on 2026-10-25. No separate private or binary feed is necessary.
- Repository was initially created with a README only: initial commit 367dffab9d1361a3af98f9fac5d314a45097e47b. Read current HEAD before further changes.
- No hosted releases, update manifest, or build workflow runs were present at the initial inspection.
- Existing accepted complete Windows baseline is Canvas Frame Builder 3.51.6, from Canvas_Frame_Builder_3.51.6_Complete.zip.
- Development updater candidate: 3.51.7, not yet verified by native Windows execution. No published updater release is implied.
- Repository read-first files: AGENTS.md and this handoff. Any partial source sync must be identified as incomplete rather than release-ready.

## Scope preserved
- Original Snap, Top-Loading, Lightweight Adaptive Depth, and Front Snap Borderless frame styles.
- UV panel generators, reinforced split joints, front snap spring toggle, custom sizes and split frames, portrait/landscape, breakaway easel, rear mount, STL/STEP/3MF exports.
- X1C bed exclusion protection, Bambu project presets, CAD renderer, preview, detailed parameters and settings.
- Per-user Electron storage remains in AppData/Roaming/Canvas Frame Builder for settings continuity; updater files under its updates subfolder.

## Development source and build
- Source archive: Frame_Builder_3.51.7_Updater_Development_Source.zip (local working copy; must not be confused with a hosted release).
- App entry: app/main.cjs; renderer: app/index.html; preload bridge: app/preload.cjs; updater modules: app/update-*.cjs and app/desktop-ui.js; helper: app/update-install.ps1.
- Canonical baseline CAD files: cad_source/ with browser/Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html.
- Node.js 22; use npm ci from package-lock.json, then npm run check and npm run build:windows. No authenticated API or app secrets are needed.
- Windows portable product identity: com.techsavage3d.canvasframe. Packaged artifact intended name: Frame_Builder_3.51.7_Windows_x64.exe; stable installed launch path should remain Frame Builder.exe or an existing user-named EXE.
- Public update feed: https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest . Manifest asset: update-manifest.json, hashes: SHA256SUMS.txt.

## Validation and blockers
- Local non-Electron Node test suite expanded from 11 to 16 passing cases. Covered rejected URLs, timeout regression, ETag/single-flight, API backoff and rate-limit reset, manifest-tag mismatch, streaming corrupt/truncated/oversize rejection, PE x64 signature basics, desktop source preservation.
- Earlier source had an undeclared timedOut write in the request timeout callback; corrected to destroy the request with a normal Error. This is the negative control path for future regression verification.
- Installer health check now accepts a matching visible-window, versioned nonce receipt even if Electron-builder's portable launcher exits after spawning the app, and restarts the previous EXE on failure when possible.
- npm registry was not reachable from this execution container. Electron dependencies, Windows native installation, actual update relaunch, and hosted CI have NOT been verified.
- Never publish a stable release or report updater functionality as verified before hosted build and an actual prior-version-to-new-version test pass on Windows. SHA-256 is not a code-signing certificate.

## Next actions
1. Complete source sync including desktop modules, package-lock, icons, build and verification scripts; verify no sensitive data, secrets, or unwanted binary build output were committed.
2. Run CI on Windows, pin build dependencies, test desktop startup and CAD export paths; report actual build result.
3. Stage an immutable test/prerelease release without overwriting existing versions. Confirm hosted assets, manifest, binary identity, and digest.
4. Test upgrade from a previous updater-capable build to a later build, including server rejection, no-network, rate limits, foreground checks, cross-volume staging, rollback, and visible window receipt.
5. Only after successful native tests, publish a stable release and update this handoff with exact commit/tag/workflow run/artifact checksums.
