# Frame Builder development handoff

## Pending 3.51.15 updater test

- Owner requested a small visible change and publication to test the updater from 3.51.14.
- Candidate 3.51.15 adds an installed-version label beside the builder title, generated from package.json by scripts/sync-builder.cjs. The native window suite verifies the label.
- release-validation.json targets previousVersion 3.51.14 and requires fresh native installation and actual UI migration checks. No earlier installer run is reused.
- CAD/browser source, updater behavior, dependencies and settings remain unchanged. Do not call this candidate validated until hosted CI and the release workflow pass.

## Current verified state (2026-10-25)

- Latest desktop release: Frame Builder 3.51.14, tag v3.51.14.
- Immutable application source: c869c68636ddbb9064fb2df8c42480972ba4ca87.
- Canonical public source/release repository: https://github.com/TechSavage1989/Frame-Builder.
- Source Windows CI for the release commit: https://github.com/TechSavage1989/Frame-Builder/actions/runs/40186586089.
- Completed hosted release verification: https://github.com/TechSavage1989/Frame-Builder/actions/runs/40187778202.
- Main may contain later test/workflow/documentation fixes. The runtime, CAD, assets and package/build identity still match v3.51.14. Published assets were retained, not rebuilt or replaced.
- Windows portable ZIP contains "Frame Builder.exe" and "README.txt". The separately hosted versioned EXE is the updater payload.
- Prior 3.51.7 through 3.51.13 releases are development previews and are not stable feed entries. Previews through 3.51.12 require manual replacement. 3.51.13 is the independent-helper client used for the genuine 3.51.13-to-3.51.14 test. The original 3.51.6 application had no updater, so its first installation also requires the ZIP.
- Last user-accepted CAD/application geometry baseline: Canvas Frame Builder 3.51.6. New desktop updater versions preserve that geometry.

## Preserved functional scope

- Original Snap, Top-Loading, Lightweight Adaptive Depth and Front Snap Borderless.
- Reinforced UV-printable panel joints, exact finished panel thickness and flat printing face.
- Optional Front Snap rear-perimeter frame springs, accepted reinforced breakaway easel, mounts and latch.
- Automatic/manual one-, two- and four-section planning, centered braces and hanger axes.
- Preview, detachable viewer, STL/STEP/3MF output and Bambu X1C exclusions.
- Browser source remains "browser/Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html". CAD source remains under "cad_source".
- Desktop title and package/update version are 3.51.14. Existing CAD/export version identifiers remain 3.51.6 where retained by the original source.
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
- "scripts/sync-builder.cjs" generates desktop HTML from the preserved standalone model and updates only desktop-specific integration/title.
- 22 source checks pass, including corrupted downloads, unsafe URLs/identity/version, retry/backoff, ETag persistence, cleanup ownership and real short-duration scheduler checks.
- Historical timeout and ETag-cache failures have negative controls. The Windows PowerShell missing-hash-command failure was reproduced in run 40178833753; corrected preflight passed in run 40178981099.
- Native frame/export suite covers all four styles, frame-spring toggle, active export guard, detached viewer, STL/STEP/3MF and isolated renderer.
- Full production native timing passed for this exact release source in run 40186586089: first check 0 ms after schedule binding, native focus return at 120706 ms, and background check at 300005 ms.
- CI reruns frame/export checks. It may reuse full timer evidence only after checking a passed parent CI and unchanged relevant production sources; otherwise it runs the full wall-clock suite.
- Actual hosted installation/rollback passed in run 40186586894: held native file lock, accented custom filename, cross-volume staging, visible new window, forced-new-window failure, exact previous EXE restoration/restart and cleanup.
- Final 3.51.13-to-3.51.14 UI update and preference checks passed in run 40187778202. Its fixture removes the cached payload so the actual Download button must fetch and verify fresh bytes; cleanup asserts both helper logs and all transaction markers are gone. These use the previous portable EXE, real public feed, Download, busy guard, native confirmation, install/relaunch and saved preference/window/shortcut checks.
- Native integration scripts are for isolated test accounts/CI. Hosted updater integration explicitly requires a GitHub Windows runner.
- Local CAD regressions passed for all section choices, 13 spring/legacy cases and 15 reserved-bed safeguards. Commands: node cad_source/check_all_frame_sections.cjs; node cad_source/check_frame_springs.cjs; node cad_source/check_reserved_beds.cjs. Legacy reserved-bed scripts may write generated reports under Validation; keep those outputs out of releases.

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
- Native negative controls: run 40184288439 shows detached PowerShell exits before preparation; actual UI run 40184559145 shows a directly attached helper dies when the GUI closes. Final independent-launcher lifecycle probe 40186547952 uses immutable 3.51.12, closes its actual GUI/portable parent, then verifies helper survival, replacement, a different visible healthy renderer and staging cleanup. This same-version diagnostic is not the genuine version migration. The final release UI gate separately verifies 3.51.13 to 3.51.14.
- app/update-launch.cjs uses a short-lived Windows PowerShell bootstrap with Start-Process, native module precedence, a per-user working directory and redirected logs. It returns the actual independent helper PID. The GUI requires a matching live helper-ready record before exiting. Do not replace it with direct attached or detached Electron child-process launch.
- scripts/launch-matrix.cjs intentionally pins historical 3.51.10; scripts/launch-lifecycle.cjs intentionally pins historical 3.51.12. Both run only in isolated GitHub Windows CI and enable loopback debugging explicitly for the test. Production enables no debugger.

## Publication workflow

1. Start from latest maintained source. Increment package/package-lock versions for application changes. Never reuse a published version.
2. Update release notes, manifest notes and "release-validation.json". Set previousVersion to the appropriate prior updater-capable release; remove any old verifiedInstallerRun when application/version changes.
3. Sync authorized source to main and confirm hosted CI.
4. Create/update an unpublished matching "release/<version>" branch or run Windows Release from main.
5. The workflow builds a prerelease, checks its exact source/tag/assets/hashes and native behavior, then promotes only after installer verification. Failed final UI validation demotes it again. A deliberate bootstrap=true config keeps an initial update-capable preview prerelease and skips stable/UI promotion; the delivered 3.51.14 config has no bootstrap flag.
6. Existing assets may be reverified after test/workflow repairs only if all production source/package/build identity matches the tag. Assets and tags remain immutable.
7. Recorded native installer tests can be reused only after validating the referenced job step succeeded, its production source matches, and its previous version matches. Final actual UI update still runs.
8. Allow the public stable feed to propagate after promotion. Verification uses normal backoff and logs unavailable feed responses rather than claiming current.
9. Update this handoff and AGENTS.md after completion. Preserve exact release source, CI evidence, hashes and limitations.

## Verified asset digests

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| Frame_Builder_3.51.14_Windows_x64.exe | 100234238 | aef5685e099d37d395e1aae6d9e8b3ce1b95054fae7999da95616c2e98007341 |
| Frame_Builder_3.51.14_Windows_x64.zip | 100243373 | 90795a508427b8b898223ec8d0d81ed3208a5335bd6422435db8df07d660fa11 |

The hosted manifest and checksum file, and the stable-named EXE inside the ZIP, match those assets. Permanent machine-readable evidence is in validation/RELEASE_VERIFICATION_3.51.14.json. Maintained verifier source 5991066ac4fe7e6dc77dcde6275d014905501d04 also passed Windows CI in run 40187776808.

## Remaining limitations

- Not code signed. SHA-256 verifies integrity against the trusted release manifest, not publisher signing.
- Hosted Windows validation passed. The user's own Windows PC has not been tested by this session. Windows x64 portable is the supported target; macOS/Linux packaging was not performed.
- Offline/errors and Retry-After throttling are injected at the request layer and checked through native IPC/UI. No live shared-IP API limit or OS-wide network disconnect was forced.
- Mechanical geometry is unchanged; no new physical print/fit/load testing was performed.
- Hard power loss or forced termination of the installer helper was not tested; incomplete transactions are retained for recovery.
- Removable/exFAT and network-share installations were not tested. Cross-volume staging was validated between hosted Windows C: and D: drives.
- License remains unspecified; package declaration is UNLICENSED. Do not choose a license without authorization.
- Local Linux display/network restrictions are not target-platform validation. Use the hosted Windows workflow for portable verification.
