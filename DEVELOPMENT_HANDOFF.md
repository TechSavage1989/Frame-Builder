# Frame Builder development handoff

## Current verified state (2026-10-25)

- Latest desktop release: Frame Builder 3.51.15, tag v3.51.15.
- Immutable application source: 1ff64849330e780c9e102b70af14975e3b67119e.
- Canonical public source/release repository: https://github.com/TechSavage1989/Frame-Builder.
- Source Windows CI for the exact release commit: https://github.com/TechSavage1989/Frame-Builder/actions/runs/40218549689.
- Completed hosted release verification: https://github.com/TechSavage1989/Frame-Builder/actions/runs/40218552668.
- Owner requested a small visible change and publication to test the updater. Version 3.51.15 adds an installed-version label beside the builder title, generated from package.json by scripts/sync-builder.cjs. The native window suite verifies its value.
- CAD/browser source, updater runtime, assets, dependencies and saved settings remain unchanged from 3.51.14. Generated desktop HTML changes only its title version and the header label.
- Main includes later documentation and evidence. Runtime and package/build identity match immutable v3.51.15; published tags and assets were not replaced.
- Windows portable ZIP contains "Frame Builder.exe" and "README.txt". The separately hosted versioned EXE is the updater payload.
- The stable feed points to v3.51.15. Fresh actual 3.51.14-to-3.51.15 download, digest verification, native confirmation, installation, visible relaunch, cleanup, settings, window size, custom filename and shortcut checks passed in the release run. Native file locking, accented filename, cross-volume staging and rollback also passed without reusing an earlier installer run.
- Prior 3.51.7 through 3.51.13 releases are development previews and are not stable feed entries. Previews through 3.51.12 require manual replacement. 3.51.13 was the independent-helper client used for the historical 3.51.13-to-3.51.14 test. Version 3.51.14 is the prior stable updater client.
- Original 3.51.6 had no updater, so its first installation requires the ZIP. Last user-accepted CAD/application geometry baseline remains Canvas Frame Builder 3.51.6.

## Preserved functional scope

- Original Snap, Top-Loading, Lightweight Adaptive Depth and Front Snap Borderless.
- Reinforced UV-printable panel joints, exact finished panel thickness and flat printing face.
- Optional Front Snap rear-perimeter frame springs, accepted reinforced breakaway easel, mounts and latch.
- Automatic/manual one-, two- and four-section planning, centered braces and hanger axes.
- Preview, detachable viewer, STL/STEP/3MF output and Bambu X1C exclusions.
- Browser source remains "browser/Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html". CAD source remains under "cad_source".
- Desktop title, installed-version label and package/update version are 3.51.15. Existing CAD/export version identifiers remain 3.51.6 where retained by the original source.
- Fusion Builder 1.4.2 is distinct. Rejected later Borderless fold-flat designs remain excluded.

## Source, build and testing

Use Node.js 22 on Windows:

~~~text
npm ci
npm run check
npm run build:windows
~~~

"Build_Windows.cmd" is the Windows shortcut. Output is under "dist".

- Legacy packaging helpers under cad_source are retained for baseline provenance. Desktop releases use the top-level npm/Electron build and release workflow; do not ship a legacy CAD ZIP as a desktop update.
- Runtime: "app/main.cjs", "app/preload.cjs", "app/desktop-ui.js", "app/update-*.cjs", "app/update-install.ps1".
- "scripts/sync-builder.cjs" generates desktop HTML from the preserved standalone model and updates only desktop-specific integration, title and installed-version label.
- 22 source checks pass, including corrupted downloads, unsafe URLs/identity/version, retry/backoff, ETag persistence, cleanup ownership and real short-duration scheduler checks.
- Historical timeout and ETag-cache failures have negative controls. The Windows PowerShell missing-hash-command failure was reproduced in run 40178833753; corrected preflight passed in run 40178981099.
- Native frame/export suite covers all four styles, frame-spring toggle, active export guard, detached viewer, STL/STEP/3MF and isolated renderer.
- Full production native timing passed for this exact release source in run 40218549689: first check 0 ms after schedule binding, native focus return at 120709 ms, and background check at 300011 ms.
- CI reruns frame/export checks. It may reuse full timer evidence only after checking a passed parent CI and unchanged relevant production sources; otherwise it runs the full wall-clock suite.
- Actual hosted installation/rollback passed in run 40218552668: held native file lock, accented custom filename, cross-volume staging, visible new window, forced-new-window failure, exact previous EXE restoration/restart and cleanup.
- Final 3.51.14-to-3.51.15 UI update and preference checks passed in run 40218552668. Its fixture removes the cached payload so the actual Download button must fetch and verify fresh bytes; cleanup asserts both helper logs and all transaction markers are gone. These use the previous portable EXE, real public feed, Download, busy guard, native confirmation, install/relaunch and saved preference/window/shortcut checks.
- Native integration scripts are for isolated test accounts/CI. Hosted updater integration explicitly requires a GitHub Windows runner.
- Prior-baseline local CAD regressions passed for all section choices, 13 spring/legacy cases and 15 reserved-bed safeguards. Those geometry sources are byte-identical in 3.51.15; the hosted native suite rechecked all four previews and exports. Commands: node cad_source/check_all_frame_sections.cjs; node cad_source/check_frame_springs.cjs; node cad_source/check_reserved_beds.cjs. Legacy reserved-bed scripts may write generated reports under Validation; keep those outputs out of releases.

## Identity, update feed, settings

- App ID: "com.techsavage3d.canvasframe".
- Feed: https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest.
- Only stable releases with a valid matching manifest are offered. No separate binary repository or embedded credentials.
- Actual installed launcher path comes from "PORTABLE_EXECUTABLE_FILE", preserving custom filenames and shortcut targets.
- Per-user storage: Windows Roaming AppData "Canvas Frame Builder", normally "%APPDATA%\Canvas Frame Builder".
- Saved browser preferences remain in that existing profile. Window bounds are in "window-state.json".
- Updater files are under "updates": "check-cache.json", "install.log", transaction helper logs, downloaded hash-named EXEs, transaction/helper/health records, and one committed "rollback.exe".
- Same-volume transaction directory beside the launcher is transient, named ".frame-builder-update-<nonce>". Cleanup requires a healthy application and exited helper.
- Automatic checks occur at startup, every five minutes while online, and when the main window returns to focus after at least two minutes. They use single-flight requests, persistent validated cache/ETags, cooldowns and server backoff.
- Downloads and restart are user-controlled. Active model/export work prevents restart.
- Validation covers HTTPS repository/asset allowlists, size/SHA-256, PE format, exact product/version and release identity. Update ZIPs are not accepted.
- NSIS can use an x86 outer container for the x64 Electron application. Do not reject the correct portable wrapper solely because its outer PE machine is x86.
- Installer uses Windows PowerShell 5.1, explicit UTF-8 job reading, direct .NET SHA-256 and native module discovery. This avoids inherited PowerShell 7 module-path problems.
- Native negative controls: run 40184288439 shows detached PowerShell exits before preparation; actual UI run 40184559145 shows a directly attached helper dies when the GUI closes. Final independent-launcher lifecycle probe 40186547952 uses immutable 3.51.12, closes its actual GUI/portable parent, then verifies helper survival, replacement, a different visible healthy renderer and staging cleanup. This same-version diagnostic is not the genuine version migration. The historical 3.51.14 release gate separately verified 3.51.13 to 3.51.14; the current gate verifies 3.51.14 to 3.51.15.
- app/update-launch.cjs uses a short-lived Windows PowerShell bootstrap with Start-Process, native module precedence, a per-user working directory and redirected logs. It returns the actual independent helper PID. The GUI requires a matching live helper-ready record before exiting. Do not replace it with direct attached or detached Electron child-process launch.
- scripts/launch-matrix.cjs intentionally pins historical 3.51.10; scripts/launch-lifecycle.cjs intentionally pins historical 3.51.12. Both run only in isolated GitHub Windows CI and enable loopback debugging explicitly for the test. Production enables no debugger.

## Publication workflow

1. Start from latest maintained source. Increment package/package-lock versions for application changes. Never reuse a published version.
2. Update release notes, manifest notes and "release-validation.json". Set previousVersion to the appropriate prior updater-capable release; remove any old verifiedInstallerRun when application/version changes.
3. Sync authorized source to main and confirm hosted CI.
4. Create/update an unpublished matching "release/<version>" branch or run Windows Release from main.
5. The workflow builds a prerelease, checks its exact source/tag/assets/hashes and native behavior, then promotes only after installer verification. Failed final UI validation demotes it again. A deliberate bootstrap=true config keeps an initial update-capable preview prerelease and skips stable/UI promotion; the delivered 3.51.15 config has no bootstrap flag and sets previousVersion to 3.51.14.
6. Existing assets may be reverified after test/workflow repairs only if all production source/package/build identity matches the tag. Assets and tags remain immutable.
7. Recorded native installer tests can be reused only after validating the referenced job step succeeded, its production source matches, and its previous version matches. Final actual UI update still runs.
8. Allow the public stable feed to propagate after promotion. Verification uses normal backoff and logs unavailable feed responses rather than claiming current.
9. Update this handoff and AGENTS.md after completion. Preserve exact release source, CI evidence, hashes and limitations.

## Verified asset digests

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| Frame_Builder_3.51.15_Windows_x64.exe | 100234877 | 9e8fea13988fe0c825be30a374d470354a61f70caefe42e8bf860bf87a963052 |
| Frame_Builder_3.51.15_Windows_x64.zip | 100243998 | 40dcec6a4ebb42db140ca3aa95207f351622059b060f7e5d72c86ddc1fec6f7b |

The hosted manifest and checksum file, and the stable-named EXE inside the ZIP, match those assets. Permanent machine-readable evidence is in validation/RELEASE_VERIFICATION_3.51.15.json. Historical 3.51.14 evidence remains in validation/RELEASE_VERIFICATION_3.51.14.json. Exact-source CI and the complete release run both passed for 1ff64849330e780c9e102b70af14975e3b67119e on hosted Windows Server 2025 (windows-2025-vs2026 image 20261021.278.1).

## Remaining limitations

- Not code signed. SHA-256 verifies integrity against the trusted release manifest, not publisher signing.
- Hosted Windows validation passed. The user's own Windows PC has not been tested by this session. Windows x64 portable is the supported target; macOS/Linux packaging was not performed.
- Offline/errors and Retry-After throttling are injected at the request layer and checked through native IPC/UI. No live shared-IP API limit or OS-wide network disconnect was forced.
- Mechanical geometry is unchanged; no new physical print/fit/load testing was performed.
- Hard power loss or forced termination of the installer helper was not tested; incomplete transactions are retained for recovery.
- Removable/exFAT and network-share installations were not tested. Cross-volume staging was validated between hosted Windows C: and D: drives.
- License remains unspecified; package declaration is UNLICENSED. Do not choose a license without authorization.
- Local Linux display/network restrictions are not target-platform validation. Use the hosted Windows workflow for portable verification.


## README refresh (2026-10-25)

Documentation-only update: reorganized the root README around the existing app icon, release downloads, numbered first-run steps, features, settings and update guidance. Claims were checked against current source, workflows and release metadata. Application source, versions, tags, release assets and repository access are unchanged. This documentation pass did not rerun physical printing or manual Windows PC tests; existing qualification limits above still apply.

## Repository layout (2026-10-26)

The root is reserved for README.md, AGENTS.md, DEVELOPMENT_HANDOFF.md, manifests, build entry points and the existing tool configuration. app/, browser/ and cad_source/ retain their existing source roles; assets/ holds branding; scripts/ holds build and test tooling; validation/ holds evidence. Supplementary guides belong in docs/. Current release notes are docs/releases/RELEASE_NOTES.md; before the next app release archive the previous notes as docs/releases/v<version>.md. Never add versioned notes or build outputs at the root. Keep published package filenames unchanged.

Run `node scripts/check-layout.cjs` before committing; CI rejects unexpected tracked or unignored root entries. Layout-only changes do not increment the app version, create tags/releases, or replace published assets. Do not use a release-trigger commit marker or a release branch for cleanup work.
