# Frame Builder 3.51.8

Adds a portable desktop updater while preserving the Canvas Frame Builder 3.51.6 CAD design.

- Checks at startup, every five minutes while online, and after returning to focus following two minutes without a check.
- Uses cached results, conditional requests, request limits and backoff.
- Downloads and installs only when requested, with progress and clear errors.
- Validates the expected repository, release, file name, size, SHA-256, PE format and Windows product/version metadata.
- Stages on the destination filesystem and requires a visible, responsive new application window. Failed launches restore the previous executable.
- Preserves the existing executable path, shortcuts, per-user settings and window size. Keeps one previous executable and cleans completed transactions after the helper exits.

Download the Windows ZIP, extract it, and run Frame Builder.exe. The standalone EXE asset contains the same application.

All four frame styles, reinforced UV-panel joints, optional frame springs, stands and STL/STEP/3MF exports retain the 3.51.6 geometry. Fusion Builder is a separate tool.

The release workflow verifies a hosted update from 3.51.7, native file locking, visible relaunch, interrupted-launch rollback, settings and shortcut preservation. Stable promotion requires those checks. The actual in-app feed, Download and Install and restart controls are then checked against this release.

The application is not code signed. Integrity hashes are not publisher signature verification. Hosted Windows testing does not replace checking operation on the user's own PC or physical testing of printed parts.
