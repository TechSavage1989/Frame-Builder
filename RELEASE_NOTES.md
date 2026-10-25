# Frame Builder 3.51.14

Reliable Windows portable updates while preserving the accepted Canvas Frame Builder 3.51.6 design.

- Checks at startup, every five minutes while online, and on focus return after two minutes without a check.
- Persistent validated cache/ETags, single-flight requests, manual cooldowns and server backoff.
- Explicit Download and Install and restart actions, useful progress/errors and active model/export protection. No automatic downloads or restarts.
- Trusted HTTPS repository/asset, exact version/name, byte length, SHA-256, PE and native Windows product/version validation.
- A short-lived Windows PowerShell bootstrap starts the installer independently and returns its actual PID. The helper survives the old GUI closing, uses per-user working storage and stages safely on the target filesystem.
- Visible responsive new-window health is required. Failed launches restore and restart the previous EXE. Settings, window bounds, custom filenames and shortcut targets are preserved, including accented filenames and cross-volume staging.
- One rollback backup is retained; app-owned staging and logs are cleaned after health and helper exit.

Download the Windows ZIP, extract it and run Frame Builder.exe. Original 3.51.6 has no updater, so its first installation requires the ZIP. Previews through 3.51.12 should be replaced manually. 3.51.13 is the corrected preview used to verify the genuine previous-version-to-new release path.

All four frame styles, reinforced UV-panel joints, optional frame springs, centered braces/mounts, established stands, bed exclusions and STL/STEP/3MF retain the 3.51.6 source and geometry. Fusion Builder is separate.

The release workflow requires exact-source Windows CI, hosted tag/assets/digests, native file locking, cross-volume staging, visible relaunch, forced-launch rollback and actual 3.51.13 in-app download/install/restart with saved preferences/window/shortcut checks. Native negative controls and a packaged parent-exit lifecycle probe are retained in the source.

Unsigned. Hash verification is not publisher-signature verification. Own-PC, physical print/fit/load, removable/exFAT/network shares, hard power loss and forced-helper termination are not validated. Offline/throttling are injected at request layer; no OS-wide disconnect or live shared-IP limit is forced. Windows x64 portable is the target.
