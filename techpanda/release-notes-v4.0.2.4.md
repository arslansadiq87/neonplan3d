# NeonPlan 3D v4.0.2.4 testing prerelease (HACS version 4.0.2.4b1)

Testing prerelease tag: `v4.0.2.4b1`. This HACS-compatible prerelease tracks implementation version 4.0.2.4. It is based on prior TechPanda `v4.0.2.3` and upstream integration `v4.0.2`.

## Included

- Signed, furniture-only CCTV/network pack with 17 equipment models.
- Lazy-loaded Infrastructure Manager with camera settings and entity bindings, recorder channels, network interfaces/IP inventory, switch ports and PoE validation, topology, routes, cable length estimates, and Wi-Fi estimates.
- Native camera coverage, infrastructure equipment/connection/Wi-Fi geometry, labels, and persistent visibility controls across floor and property views.
- Backward-compatible plan metadata, undoable edits, standard import/export, and cleanup of connection references on furniture duplication/deletion.
- No network discovery, hardware configuration, credential storage, or video streaming implementation is added by the manager.

## Verification status

- Production frontend build and typecheck pass; frontend suite passes 746 tests under UTC. Existing bundle budgets are unchanged.
- The production preview initializes in headless Chrome with WebGL2. The preview's simulated Home Assistant API saves the synthetic plan. After fixing pack item type recognition, the manager displays all 13 seeded equipment items.
- **Testing prerelease limitations:** full UI interaction coverage, all 13 requested screenshots, and rendered 3D visibility/mode checks have not completed. The partial browser probe seeded 13 devices, not the requested 14 (it included one access point). Do not describe these untested workflows as verified.
- GitHub CI passed on `18149dacba4af42db2609df7e73006a1df6690ca` (frontend build/tests, Python 3.13 Home Assistant tests, signing registry and Linux archive extraction): [run 45985289950](https://github.com/arslansadiq87/neonplan3d/actions/runs/45985289950).
- Home Assistant entity behavior was simulated using preview mocks; no live Home Assistant integration test was performed. This prerelease was not deployed to Home Assistant and no service was restarted.

## Artifacts

- HACS archive: `techpanda/dist/neonplan3d.zip` (83 root-level files; SHA-256 `2814870a53fd8cf6a77fd428933b333cfefbcab2d8f17c03efc2af1a599ad314`).
- Furniture pack: `techpanda/furniture/dist/cctv-network.source.fp3dpack` (SHA-256 `463be22ae94313a47b43af53cb8211026f1645d642d9db9fc8afd9a9d748c148`).
- This is a testing prerelease, not a stable release. Enable HACS pre-releases for this repository to select `v4.0.2.4b1`. Before installation, make a normal HA backup and an integration-only backup; see the attached `CCTV-NETWORK-manual.md` for acceptance steps and rollback instructions.

## Installation and rollback

1. Keep the existing HACS custom repository `arslansadiq87/neonplan3d` and integration entry. Enable pre-releases for the repository and select `v4.0.2.4b1`. Back up Home Assistant and the integration before installation.
2. After installing through HACS, restart only during a planned test window. Import the signed CCTV/network `.fp3dpack` from NeonPlan **Extensions > Packs > Import furniture pack**, then run the documented synthetic acceptance checklist.
3. The Infrastructure Manager records network and CCTV planning data; it does not configure physical devices. Do not install this testing prerelease on a production plan before completing acceptance.

Rollback: select the preserved stable `v4.0.2.3` in HACS or restore the prepared integration-only backup with `Restore-NeonPlan -Backup <archive> -ApproveRemoteWrite`. A restart after restore is separately approval-gated. This prerelease does not update the `v4.0.2.3` stable release.
