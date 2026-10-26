# Frame Builder - read first

1. Read DEVELOPMENT_HANDOFF.md before changing source, distribution, build scripts, or releases.
2. Canonical repository is https://github.com/TechSavage1989/Frame-Builder. It is public. Public source and compiled releases are owner-approved. Do not change visibility or choose a license without a separate request.
3. Latest validated desktop release is Frame Builder 3.51.15, tag v3.51.15, application source 1ff64849330e780c9e102b70af14975e3b67119e. Last accepted CAD baseline is Canvas Frame Builder 3.51.6. Start from maintained source and read the handoff, not an older ZIP.
4. Preserve all four frame styles, reinforced UV-panel joints, optional Front Snap frame springs, centered braces and mounts, accepted stand designs, bed exclusions, preview, saved preferences, and STL/STEP/3MF exports.
5. Stable installed name is Frame Builder.exe; retain the actual existing filename when customized. Keep settings, logs, cache, downloads, staging records and one rollback backup in the legacy per-user Canvas Frame Builder storage. Target-volume staging is transient.
6. Check automatically but never download, install or restart without user action. Guard active operations. Offline and failed checks must remain unknown, never up to date.
7. Never overwrite published tags or assets. Application changes require a version increment. Existing releases may be reverified only when production source and package/build identity match their immutable tag; verification does not rebuild or replace assets.
8. Require source checks, hosted Windows launch, actual timers, hosted download/digest checks, native installation/rollback, settings and shortcut continuity before calling a release ready. Reuse passed tests only with recorded evidence and unchanged relevant source.
9. Rejected Borderless fold-flat prototypes remain excluded. Fusion Builder 1.4.2 is a separate tool. Do not reintroduce the rejected stand or expand Fusion scope without an explicit request.
10. No server setup, Codex CLI automation, unattended workers, credentials, payment systems or API-account setup.

## Repository layout (2026-10-26)

The root is reserved for README.md, AGENTS.md, DEVELOPMENT_HANDOFF.md, manifests, build entry points and the existing tool configuration. app/, browser/ and cad_source/ retain their existing source roles; assets/ holds branding; scripts/ holds build and test tooling; validation/ holds evidence. Supplementary guides belong in docs/. Current release notes are docs/releases/RELEASE_NOTES.md; before the next app release archive the previous notes as docs/releases/v<version>.md. Never add versioned notes or build outputs at the root. Keep published package filenames unchanged.

Run `node scripts/check-layout.cjs` before committing; CI rejects unexpected tracked or unignored root entries. Layout-only changes do not increment the app version, create tags/releases, or replace published assets. Do not use a release-trigger commit marker or a release branch for cleanup work.
