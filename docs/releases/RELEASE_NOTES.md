# Frame Builder 3.51.18

Keeps updater staging off the Desktop.

- Stages updates in the existing per-user update storage when it shares the application's volume, instead of creating a folder beside Frame Builder.exe.
- For an application on another volume, uses a hidden temporary directory at that volume's root and preserves same-volume replacement and rollback.
- Cleans up legacy staging folders after a verified successful update. Failed replacement staging is removed once the exact previous EXE is restored; diagnostic records remain in app storage until the new app can finish housekeeping after a retry.

The installed filename remains Frame Builder.exe. Saved settings, shortcuts, all four frame styles and exports are preserved.

An older installed version still uses its old updater while installing this release, so that one update may briefly create the old folder. Installing this ZIP manually avoids that transition. The new staging behavior applies to updates initiated by 3.51.18 and later.

Update through Help > Check for updates, then Download and Install and restart. Confirm the restart prompt. For a manual installation, extract the Windows ZIP and replace your existing Frame Builder.exe while the app is closed.

Windows x64 portable. The application is unsigned. Hosted Windows validation does not replace checking the update on your own PC. No new physical print testing is included.
