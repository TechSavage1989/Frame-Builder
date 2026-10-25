# Frame Builder 3.51.11 development preview

Corrects Windows PowerShell launch from the packaged desktop app. The helper runs as a normal Windows child process, with captured per-user logs, and remains alive when the old application exits. Detached launches failed before loading their script; the native negative control and corrected launch were reproduced in run 40184288439.

This is an intentional update-capable development preview, not a stable feed entry. It enables a genuine previous-version-to-next-release UI test for the following release. Older 3.51.7 through 3.51.10 previews can fail safely before update preparation; install this ZIP manually for testing.

Preserves the complete Canvas Frame Builder 3.51.6 CAD design and all four styles, reinforced UV-panel joints, optional frame springs, stands, preview, saved preferences and STL/STEP/3MF exports.

The updater checks at startup, every five minutes while online and on focus return after two minutes. Downloads and installation require user action. It validates repository, version, size, SHA-256, Windows PE/product metadata, stages on the destination filesystem and requires a visible responsive new window. Failed launches restore and restart the previous executable. One rollback executable is retained after the helper exits.

Not code signed. Hash verification does not establish publisher signing. Hosted Windows tests do not replace checks on the user's own PC or physical print/fit tests.
