# Frame Builder

Frame Builder is a Windows portable application for creating 3D-printable artwork frames and UV-printable backing panels. It retains the four accepted frame styles: Original Snap, Top-Loading, Lightweight Adaptive Depth, and Front Snap Borderless. It supports support-free frames, split panels, portrait/landscape, STL/STEP/3MF export and X1C bed-exclusion safeguards.

## Baseline and development state

- Last accepted complete application: **Canvas Frame Builder 3.51.6**.
- Updater-enabled desktop source: **3.51.7**, a **development candidate** until an actual two-version Windows update and rollback have been tested.
- GitHub Actions Windows compilation and visible-window smoke test passed on [run #40175655458](https://github.com/TechSavage1989/Frame-Builder/actions/runs/40175655458).
- The Windows candidate ZIP is available under **Artifacts** in that run (artifact name: `Frame-Builder-Windows-x64-Candidate`). It is not a published release.
- Source and compiled Windows releases are authorized to be public. No separate binary repository, tokens or server are required.

## Build locally (Windows)

Use Node.js 22 and run `npm ci`, then `npm run check` and `npm run build:windows` in the repository root. Alternatively use `Build_Windows.cmd`. The portable EXE is generated under `dist`. The published asset filename contains the version; the application's installed launch filename can remain `Frame Builder.exe`.

## Build using GitHub Actions

1. Open [Frame Builder CI](https://github.com/TechSavage1989/Frame-Builder/actions/workflows/ci.yml).
2. Open the latest run and confirm both source and Windows jobs succeed.
3. Download `Frame-Builder-Windows-x64-Candidate` under Artifacts.
4. Extract and test the executable on your actual Windows computer. Verify frame styles, previews, STL/STEP/3MF exports, settings and window handling.

## Publish a GitHub pre-release

After verifying the Windows candidate on your PC:

1. Open [Windows Release](https://github.com/TechSavage1989/Frame-Builder/actions/workflows/release.yml).
2. Select **Run workflow**, select **main**, and run it.
3. The workflow checks the current package version, builds the Windows EXE, runs tests, creates the version tag and uploads the EXE, `update-manifest.json`, and `SHA256SUMS.txt` to GitHub Releases.
4. Verify the release job and downloadable assets. This initially publishes a **pre-release**, not a stable updater feed entry.
5. After native Windows and complete updater testing, promote the release to stable in GitHub Releases.

The workflow refuses to overwrite an existing tag. Increase `package.json` version before another release.

## Updater verification still required

Frame Builder 3.51.6 had no built-in updater, so testing the update flow requires **two updater-capable builds**, such as 3.51.7 and a subsequent 3.51.8. Verify a real hosted manifest, download, SHA-256, installation, visible relaunch, settings continuity, and rollback after a simulated failure. Do not mark this flow verified based only on unit tests and a visible-window smoke test.

Read [AGENTS.md](AGENTS.md) and [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md) before development.

## Licensing

The owner approved public source and releases. No reuse/redistribution license has been selected, and the package currently declares UNLICENSED. Do not choose a license without an explicit request.
