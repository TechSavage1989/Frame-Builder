# Frame Builder - read first

1. Read DEVELOPMENT_HANDOFF.md before changing source, distribution, build scripts, or releases.
2. Main public repository is https://github.com/TechSavage1989/Frame-Builder. Public source and release distribution are explicitly approved by the owner as of 2026-10-25. Do not change repository visibility or select a license without a separate request.
3. Accepted CAD baseline is Canvas Frame Builder 3.51.6. Corrected desktop 3.51.11 is an intentional bootstrap preview. Current 3.51.12 source must pass complete 3.51.11-to-3.51.12 UI install/relaunch validation before stable delivery. Read the current handoff and latest source, not an old ZIP.
4. Preserve all four frame styles, UV base and split-panel connectors, optional front-snap frame springs, print bed exclusion safeguards, stand designs, preview, settings, and STEP/STL/3MF export behavior unless asked otherwise.
5. Windows target is a portable, stable-named Frame Builder.exe at the installed location. Store updater state, downloads, logs and staging within the legacy Canvas Frame Builder per-user app-data path, maintaining settings and shortcut compatibility.
6. Never download, install, or restart without user action. No offline or failed check may be represented as up to date. Do not bypass release integrity, identity, or path validation.
7. Never overwrite a published tag or release. Confirm exact tag, asset size, SHA-256 and hosted CI before claiming a release; keep the feed at the main public repo and no separate binary-only feed.
8. Validate native Windows launch, visible-window health, update download/install/rollback, file locking, rate limiting, foreground checks, and preservation of settings and shortcuts. Mocked tests alone are not release verification.
9. Prior rejected fold-flat Borderless prototypes are not accepted baselines. Fusion 360 Builder 1.4.2 is a distinct tool, not a replacement for Frame Builder.
10. No server setup, Codex CLI automation, unattended workers, credentials, payment systems, or API-account setup.
