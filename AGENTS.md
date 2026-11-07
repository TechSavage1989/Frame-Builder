# Frame Builder - read first

1. Read DEVELOPMENT_HANDOFF.md before changing source, distribution, build scripts, or releases.
2. Canonical repository is https://github.com/TechSavage1989/Frame-Builder. It is public. Public source and compiled releases are owner-approved. Do not change visibility or choose a license without a separate request.
3. Latest validated desktop release is Frame Builder 3.51.16, tag v3.51.16, application source 1a4d688447408586a63f80a0c8fd70442f7d26f4. Last accepted CAD baseline is Canvas Frame Builder 3.51.6. Start from maintained source and read the handoff, not an older ZIP.
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

## Repository standards (all contributors and AI tools)

This repository follows the shared TechSavage1989 standard in [`docs/REPOSITORY_STANDARDS.md`](docs/REPOSITORY_STANDARDS.md), the same file in every app repository. Read it before changing anything. In short:

- **README:** centered header (real icon, one `<h1>`, tagline, quick links Download · Get started · Features · Screenshots · Updates · Development, hero image), then the standard section order. Update it in the same pull request as any user-visible change.
- **Screenshots:** real captures with fictional data in `docs/images/` (`hero.png` + kebab-case names). Recapture any screenshot a UI change makes stale, in the same pull request.
- **Layout:** compact root; respect the root allowlist and checks above. Never commit build output, binaries, archives, logs, caches or secrets.
- **Branches:** short-lived `feat/` `fix/` `docs/` `chore/` `release/` branches, one focused change per pull request, merge only on green checks, delete the branch after merging.
- **Instructions:** this file is the single source of project rules for every tool; `CLAUDE.md` imports it. Add new rules and gotchas here.

Where this file's project-specific rules differ from the shared standard, this file wins; an enforced check script wins over both.

## Preview generation and source synchronization (3.51.16)

- Edit cad_source, regenerate browser HTML with python cad_source/build_html.py, then run node scripts/sync-builder.cjs. Commit both generated HTML files. The generator writes only into browser/, not the repository root.
- Preview workers reuse the embedded geometry source and shared preview_build.js; do not create a second copy of geometry logic. Keep worker-src blob: in the desktop CSP while network connections remain blocked.
- Preserve the historical STL header already present in released generated HTML when regenerating source; changing that label changes every export digest even when geometry is identical.
- scripts/preview-integration.cjs runs through the native Windows suite and checks real worker cancellation, fallback, export gating and slider coalescing.
- The README gallery intentionally covers every main feature, a documented exception to the shared 2-4-image guideline. Recapture affected images when the UI changes.

- Release manifest summaries are derived from docs/releases/RELEASE_NOTES.md. Keep those notes current in the release PR. Never edit already-published assets to correct summary wording.

## Pending updater test release (3.51.17)

- Owner requested a small visible test update after manually installing 3.51.16. The viewer heading now reads "3D preview"; runtime/geometry behavior is unchanged.
- Actual hosted update UI tests use the exact standard filename "Frame Builder.exe". Direct native tests retain accented custom-name coverage.
- Publish only after the existing Windows CI and fresh 3.51.16-to-3.51.17 release gates pass. Record the final immutable source and evidence in the handoff.
