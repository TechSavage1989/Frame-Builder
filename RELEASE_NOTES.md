# Frame Builder 3.51.12

Adds a reliable Windows portable desktop updater while preserving the Canvas Frame Builder 3.51.6 CAD design.

- Checks at startup, every five minutes while online, and on focus return after two minutes without a check.
- Uses persistent validated cache/ETags, single-flight requests, manual cooldowns and server backoff.
- Downloads and installs only on request, with progress, short release notes and clear errors. Active models and exports prevent restart.
- Validates the trusted repository, release, asset filename, size, SHA-256, Windows PE format and exact product/version metadata.
- Runs the Windows PowerShell helper as a normal child process. A native negative control reproduced the old detached-process failure before the script loaded.
- Stages on the destination filesystem and requires a responsive visible new app window. Failed launches restore and restart the previous executable.
- Preserves per-user settings, window size, existing custom executable names and shortcut targets. Supports accented filenames and cross-volume staging. Keeps one rollback backup and cleans app-owned transaction files after health confirmation and helper exit.

Download the Windows ZIP, extract it, and run Frame Builder.exe. Original 3.51.6 users need that first manual install because the original app has no updater. Replace development previews 3.51.7 through 3.51.10 manually if their updater cannot prepare. 3.51.11 is the corrected update-capable preview used for the actual previous-to-new release test.

All four frame styles, reinforced UV-panel joints, optional frame springs, centered braces/mounts, established stands and STL/STEP/3MF exports retain the accepted 3.51.6 geometry. Fusion Builder is separate.

The release workflow checks exact hosted source/tag/assets/hashes, native file locking, visible relaunch, interrupted-launch rollback and actual 3.51.11 in-app download/install/restart with settings and shortcut preservation. Stable delivery requires all gates to pass.

The app is not code signed. SHA-256 verifies integrity against the trusted release manifest, not publisher signing. Hosted Windows checks do not replace testing on the user's own PC or physical print/fit/load tests. Offline and throttling tests inject request failures; a live shared-IP API limit or OS-wide disconnect is not forced.
