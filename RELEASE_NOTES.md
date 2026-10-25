# Frame Builder 3.51.13 development preview

Uses Windows Start-Process to launch the update helper independently of the Electron GUI and its process job. The bootstrap exits before restart, returns the real helper PID, uses per-user storage as its working directory and captures output there. The app waits for the matching helper-ready record before closing.

Native lifecycle probe 40186253403 used the actual published 3.51.12 app, closed its real GUI and portable launcher, then confirmed independent helper survival, replacement, a new visible healthy renderer, rollback backup and staging cleanup. This same-version diagnostic is not a substitute for the next genuine two-version release test.

This is intentionally a prerelease update client. It is not a stable feed entry. The following version must pass the full previous-to-new in-app update test before stable delivery. Older previews through 3.51.12 should be replaced manually.

The complete Canvas Frame Builder 3.51.6 design is preserved: four frame styles, reinforced UV-panel joints, optional frame springs, accepted stands, preview, settings and STL/STEP/3MF. Source and browser geometry are unchanged. Downloads/restarts require user action. Trusted release/asset/hash/PE/product/version validation and rollback remain mandatory. Not code signed; own-PC and physical print validation are not performed.
