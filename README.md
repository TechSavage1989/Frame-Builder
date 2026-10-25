# Frame Builder

Windows portable application for 3D-printable frames and UV-printable backing panels.

**[Download Frame Builder 3.51.15](https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.15/Frame_Builder_3.51.15_Windows_x64.zip)**

Extract and run "Frame Builder.exe". Keep its location for stable shortcuts. Custom executable filenames are retained during updates. Install this ZIP manually first when coming from original 3.51.6 or a development preview through 3.51.12.

All four frame styles from Canvas Frame Builder 3.51.6 are preserved: Original Snap, Top-Loading, Lightweight Adaptive Depth and Front Snap Borderless. Includes reinforced UV-panel joints, optional frame springs, section planning, accepted stands, preview and STL/STEP/3MF output.

## Updates

Version 3.51.15 adds an installed-version label beside the builder title for testing the updater from 3.51.14. The release passed a fresh in-app download, installation and relaunch from that previous version.

Checks automatically at startup, every five minutes while online, and after returning to the main window following two minutes without a check. Choose "Download", then "Install and restart" after saving your work. Downloads and restarts require your action.

The updater validates release identity, byte length, SHA-256, PE format and Windows product/version. It stages on the destination filesystem, verifies a visible responsive new window, and restores the previous EXE on failure. Saved preferences, window bounds and shortcut targets are retained in the legacy per-user storage.

## Verification and development

Windows CI covers all four previews, exports, real native focus/background timers, hosted installation, file locking, Unicode filenames, cross-volume staging, rollback, saved preferences and shortcut continuity.

[Release notes](https://github.com/TechSavage1989/Frame-Builder/releases/tag/v3.51.15) | [Checksums](https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.15/SHA256SUMS.txt) | [Validation](https://github.com/TechSavage1989/Frame-Builder/actions/runs/40218552668)

Use Node.js 22 on Windows:

~~~text
npm ci
npm run check
npm run build:windows
~~~

Read [AGENTS.md](AGENTS.md) and [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md) before making changes or publishing.

The application is not code signed. Hosted testing does not replace checking it on your own PC. Source and releases are public; no reuse license has been selected.
