Revision 3.50.8 / Fusion 1.2.0 validation

Place the extracted Canvas_Frame_v3_50_8 and Print_Frame_Fusion_Builder_1.2.0 folders side by side. Pass their common parent as the first command-line argument to these scripts.

parameter_cases.cjs creates the numeric geometry case JSON files. check_native_geometry.py requires CadQuery and consumes those JSON files. check_new_controls.py requires Playwright and a Chromium binary. The application Source directory also contains regression, reserved-bed, browser and serialized-placement checks. Fusion Validation contains API-shaped startup, parameter-readback, body-reference and native-sketch tests.

These tools are engineering checks, not production-app dependencies. They do not run Fusion or establish a physical load rating. Test doubles do not execute the Fusion constraint solver.
