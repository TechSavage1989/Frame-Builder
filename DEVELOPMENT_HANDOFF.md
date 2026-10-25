# Frame Builder development handoff

## Active checkpoint 2026-10-25

Read AGENTS.md first. Canonical public source and releases: https://github.com/TechSavage1989/Frame-Builder. Public source/binaries are owner-approved; visibility and licensing are unchanged.

The accepted CAD baseline is Canvas Frame Builder 3.51.6. Source under browser and cad_source remains byte-identical to imported commit 4457d8110ef2d868f423c58823208679dddf190b. Preserve all four frame styles, reinforced UV-panel joints, optional Front Snap springs, centered braces/mounts, accepted stands, bed exclusions, settings, preview and STL/STEP/3MF. Rejected Borderless fold-flat prototypes and Fusion Builder changes are excluded.

Current source is 3.51.12, pending complete release verification. 3.51.11 is an intentional development preview used as the previous update client. It fixes the real packaged installer failure. Native probe run 40184288439 launched the same helper from the actual immutable 3.51.10 Electron app: detached plus ignored output exited without preparation; detached plus file output also exited; a normal child with file output reached ready. Child unref allows the old GUI process to exit, while Windows keeps the normal child alive. Full actual install/relaunch must still verify that behavior.

3.51.10 native CI passed on ae1d532e74f093e53162a34b48d65ac1ebadb461, run 40183061600, including actual two/five-minute timers, four previews and exports. Its native hosted install, locks, Unicode filename, cross-volume stage, cleanup and forced rollback passed in run 40183062342. The actual older app UI launch failed safely. 3.51.7 through 3.51.10 remain immutable prereleases and are not successful update clients.

Next: verify 3.51.11 CI and its bootstrap prerelease, then 3.51.12 with previousVersion 3.51.11 and bootstrap removed. Require the full real feed/download/native-confirmation/install/relaunch/settings/shortcut path before stable delivery. Do not overwrite published tags/assets. Bootstrap=true explicitly prevents stable promotion and skips final UI migration because previous clients are broken. It must be absent from the final release.

Build using Node 22: npm ci; npm run check; npm run build:windows. Build_Windows.cmd is the Windows shortcut. CI is .github/workflows/ci.yml; release is .github/workflows/release.yml. Release branches release/<version> must match package identity. Existing assets can only be reverified when production code and package/build identity match their immutable tag.

Settings: Windows Roaming AppData/Canvas Frame Builder, using the actual known folder, with updates beneath it. Preserve this legacy profile. Stable launch name is Frame Builder.exe; retain custom installed filenames and exact shortcut targets. Only target-volume stage directories are transient beside the launcher. Retain one rollback.exe under per-user updates. Cleanup waits for healthy CAD/window and exited helper; active install/download prevents housekeeping.

Feed: https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest. App ID: com.techsavage3d.canvasframe. No embedded credentials or separate binary feed. No automatic download/restart. Offline/errors remain unknown; ETags, cached validated manifests, single-flight, Retry-After/backoff and manual cooldowns are persistent. Archives are not accepted by the updater.

Tests: npm run check (22); node scripts/negative-control.cjs; source CAD regression scripts; scripts/native-integration.cjs (actual Windows preview/exports/real native timers); scripts/hosted-update-integration.cjs direct and ui (isolated GitHub Windows runner only). Diagnostic negative control scripts/launch-matrix.cjs intentionally uses immutable 3.51.10, not the current version. See validation/launch-matrix branch and run 40184288439.

Limitations: unsigned; user's own PC not tested; no new physical print/fit/load validation. Offline/rate limits are injected at the request layer and shown through native IPC/UI; no live shared-IP rate limit or OS-wide disconnect forced. Public source has no selected reuse license (UNLICENSED). No server, Codex CLI automation, unattended workers, credentials, payment or API-account setup is in scope.

Replace this checkpoint with exact final version/source/tag, CI and release runs, assets/digests and remaining limitations after successful final release validation.
