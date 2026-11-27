# NeonPlan 3D v4.0.2.4b4 testing prerelease

Published testing prerelease based on upstream `v4.0.2`, continuing the TechPanda `v4.0.2.4b3` line. Stable rollback remains `v4.0.2.3`. This is a testing prerelease, not a stable release.

## Included

- Smart RGB furniture pack release 2. Pack ID `studio.techpanda.smart_rgb_lighting` and both item IDs remain unchanged. The default wall mount is 1.0 m, matching the native pack renderer.
- The lazy Smart RGB renderer now refreshes native floor furniture geometry after its registration even when the saved plan key is unchanged. Bound entity changes also refresh the geometry.
- The wall fixture renders only configured LED strips and dark housings. No triangular backing panels, decoration or unused outlines are rendered. Switched-off housings use the visible dark blue-charcoal `#344b61`.
- Physical strips and animated illumination share the same furniture-local projection and floor-group parent. Mounting elevation, rotation, resizing, floor elevation and Apart/Stacked movement are applied once.
- Unbound, missing, unknown, unavailable, powered-off and zero-brightness states remain dark. Animated effects require valid power-on and a non-solid effect. Demo animation remains isolated from production rendering.
- Existing CCTV, networking, water systems, solar panels, upstream signing keys and TechPanda furniture-only signing restrictions are retained.

## Verification

- Frontend regression: **766/766 passed** under `TZ=UTC`; typecheck passed.
- Production build passed all existing bundle budgets: `neonplan3d.js` 795.3/870 KB, 3D viewer 939.6/940 KB, editor 1154.0/1160 KB, Smart RGB lazy chunk 52.8/240 KB, Infrastructure Manager 46.7/240 KB.
- Native runtime tests cover only configured wall strips, housing visibility, entity-state behavior, animation gating and physical/animated alignment. The browser harness uses the production bundles and lazy module with synthetic plan and HA states; manager service calls and save/reload were mocked. No browser exceptions or failed resource requests occurred.
- Numerical browser comparison covered both fixtures at elevations 0, 0.9144, 1.5 and 2.5 m and rotations 0/90/180/270 degrees. Animated endpoints were within 2.315 mm of wall-strip mesh vertices and 8.943 mm of hex LED mesh vertices. Apart and Stacked screenshots and the transformed floor-group values were checked against the native viewer targets after settling.
- Screenshots are in `techpanda/furniture/dist/smart-rgb-viewer-previews/`: `wall-housing-powered-off.png`, `wall-strips-solid-color.png`, `wall-strips-animated.png`, `hex-frame-powered-off.png`, `hex-frame-animated.png`, `front-both-animated.png`, `side-both-animated.png`, `isometric-both-animated.png`, `same-elevation-0m.png`, `same-elevation-0_9144m.png`, `same-elevation-1_5m.png`, `same-elevation-2_5m.png`, `wall-rotation-0.png`, `wall-rotation-90.png`, `wall-rotation-180.png`, `wall-rotation-270.png`, `property-apart-active.png` and `property-stacked-active.png`. They contain synthetic states; Property View also shows unrelated demo property geometry.
- Smart RGB pack release 2 signature verified with the existing TechPanda key. Pack SHA-256: `326c480c888e1368e804bc0ce28570ef4b48b8315c5df6ff55913dd0bca78b93`. The three official signing keys are unchanged; TechPanda remains furniture-only.
- HACS ZIP rebuilt from official upstream `v4.0.2` plus inventoried downstream overlays. It contains 84 root files including `frontend/neonplan3d-smart-rgb.js`; POSIX paths, extraction inventory and hashes passed local verification. ZIP SHA-256: `1fe7681926351f9777d6bd61cb56662a6b708ada918b8dfb4827bd23bb58783e`.
- Optional HA examples ZIP SHA-256: `8ba74ff767827fdac2b37dbfad616c466604972dc703dcc5e91fa4353e9c08cd`. All three asset hashes are in `techpanda/dist/SHA256SUMS-v4.0.2.4b4.txt`.
- Home Assistant behavior was simulated only. Live HA entities, controller API behavior and physical light output were not tested. No HA YAML was installed; no HA configuration, plan or service was changed.
- GitHub CI passed on commit `b67f32e816416cc01afcf24324c3c201f8e6839e`, run [46073140062](https://github.com/arslansadiq87/neonplan3d/actions/runs/46073140062). Frontend regression/typecheck/build freshness, Linux archive validation, Python lint/mypy, Home Assistant pytest and signing-key registry checks all passed. This prerelease is published for testing.

## Local artifacts

- Integration ZIP: `techpanda/dist/neonplan3d.zip`.
- Signed furniture pack: `techpanda/furniture/dist/techpanda-smart-rgb-lighting-v2.fp3dpack`.
- Optional HA examples: `techpanda/dist/techpanda-smart-rgb-ha-examples.zip`.
- Checksums: `techpanda/dist/SHA256SUMS-v4.0.2.4b4.txt`.

Do not deploy through SSH, install optional HA YAML, operate physical lights or restart Home Assistant without explicit approval.
