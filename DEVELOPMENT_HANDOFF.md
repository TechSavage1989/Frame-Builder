# Frame Builder development handoff

## Active checkpoint 2026-10-25

Canonical public source/releases: https://github.com/TechSavage1989/Frame-Builder. Public source and binaries are approved; do not change access or licensing. Read AGENTS.md first.

Current source is 3.51.14, pending full release verification. 3.51.13 is the independent-launcher bootstrap preview. Windows Start-Process now creates an independent helper through a short-lived PowerShell bootstrap. It returns the actual helper PID; the GUI requires a matching live ready marker. Per-user working directory avoids holding portable extraction files. Output logs and all transaction files are owned and cleaned only after health and helper exit.

Native controls: run 40184288439 proves detached PowerShell exits before loading its helper. A normal child prepared, but actual 3.51.11-to-3.51.12 UI run 40184559145 showed that child died with the GUI, leaving the original EXE intact. Both are failed preview clients. Run 40186253403 proved the new independent launcher from the actual published 3.51.12 app: old GUI exited, helper survived, same-version transaction completed, new visible renderer confirmed and staging cleaned. That diagnostic is explicitly same-version and does not count as the final genuine migration.

Next: verify 3.51.13 source CI and bootstrap prerelease, then verify 3.51.14 with previousVersion 3.51.13 and bootstrap absent. Require full hosted download, native confirmation, installation, visible health, settings/window/shortcut preservation, file locks, cross-volume staging, rollback and cleanup before stable delivery. Never overwrite existing tags/assets. Previews 3.51.7 through 3.51.12 require manual replacement. 3.51.13 remains a prerelease client; bootstrap prevents promotion.

Baseline: accepted Canvas Frame Builder 3.51.6, imported at 4457d8110ef2d868f423c58823208679dddf190b. browser and cad_source remain byte-identical. Preserve Original Snap, Top-Loading, Lightweight Adaptive Depth, Front Snap Borderless, reinforced UV-panel joints, optional springs, centered braces/mounts, accepted stands, sectioning, bed exclusions, settings and STL/STEP/3MF. Rejected fold-flat Borderless prototypes remain excluded; Fusion Builder 1.4.2 is separate.

Build with Node 22: npm ci; npm run check; npm run build:windows. Build_Windows.cmd is the Windows shortcut. Desktop releases use the top-level workflow, not legacy CAD ZIP packaging. Source checks: 22 plus negative controls. Native source 3.51.12 CI run 40184558341 passed all previews/exports and real focus/background timing [0,120706,300001] ms. New 3.51.13 and final version still require exact-source hosted CI. Native integration and installer scripts are for isolated CI/test accounts. launch-lifecycle intentionally uses immutable 3.51.12 with pinned digest and privileged loopback inspector only in the test; production does not enable a debugger.

Settings use Windows' actual Roaming AppData known folder, Canvas Frame Builder, with updates underneath. Keep stable Frame Builder.exe or the existing customized filename and exact shortcut target. One rollback.exe lives in updates; target-volume stage folders beside the EXE are transient and only cleaned after healthy UI plus helper exit. Do not clean active install/download jobs or incomplete recovery evidence.

Feed: https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest. App ID: com.techsavage3d.canvasframe. Public source and binary feed share this repository. No embedded credentials. Startup, five-minute and two-minute focus policies use native main-process timers; single-flight, persistent validated ETags/cache, backoff/Retry-After and manual cooldowns. Never auto-download/restart. Offline/error is unknown, never current. EXE-only updates reject archives, wrong identity/version, bad digest/size and unsafe HTTPS hosts. Product/PE metadata is not publisher signing.

Remaining limits: unsigned; own PC, physical prints, removable/exFAT/network shares, hard power loss and forced helper termination not tested. Offline/throttling are injected at request layer and checked via native UI; no OS-wide disconnect or actual shared-IP limit forced. macOS/Linux packaging not performed. License remains UNLICENSED. No server, Codex CLI automation, unattended workers, credentials, payments or API-account setup.

After full migration succeeds, replace this checkpoint with exact final version/source/tag, source CI/release evidence, assets/digests, commands/paths and limitations.
