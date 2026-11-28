# TechPanda testing prerelease 4.0.2.4b9

This prerelease is based on official NeonPlan 3D v4.0.2 and retains the b8 underground tank visibility behavior. It refines inspection rendering and prevents underground furniture geometry from being picked through intervening floors or roofs.

## Underground tank rendering

- Tank bodies use restrained slate transparency, with depth testing enabled. Outlines are muted blue-grey, non-additive, and depth tested. Dense furniture-part edges and the always-on cyan cage are suppressed for underground tanks; a compact boundary remains during inspection.
- The inspection cutaway is localized to each tank footprint. Its top rim is subdued to match the concrete visualization. Inspection off removes inspection geometry and restores the ordinary floor surface.
- The underground selection ghost participates in normal depth testing. Furniture hit testing checks intervening floors and roofs before returning an underground tank.
- The signed Water Systems Pack release 4 is reused unchanged. Existing pack item IDs, tank placements, dimensions, rotations, sensor bindings, capacity settings, and plans are not migrated or rewritten.

## Production reproduction and limits

- A read-only copy of the latest saved Ground Floor plan contains two tanks on `floor_1`, elevation 0 m. Their IDs are `furniture_qgabjzj7` and `furniture_hun61h2y`; each has explicit `mount_y: -2 m`, dimensions 7.7724 x 2.1336 x 2 m, and rotations 90 and 270 degrees. Current saved binds are null. Both world-space bounds are -2 to 0 m; floor translation and mounting height are applied once.
- Browser screenshots were generated from that plan with the candidate b9 production bundles. The saved main plan has one floor, so its Apart and Stacked modes have no inter-floor separation to demonstrate. Other named plans in storage are separate plans, not additional floors in this building. Simulated sensor levels are local-only and do not change saved bindings.
- The supplied reference screenshots were not present in the received attachment set. Visual review was performed on locally captured production-plan screenshots; broad property views retain unrelated native architecture outlines, while the tank-specific bright cyan cages are removed.

## Compatibility and validation

- Upstream baseline remains v4.0.2 and the downstream branch remains `techpanda-custom`. Stable v4.0.2.3 remains the rollback release.
- HACS ZIP is built from the official v4.0.2 integration plus inventoried runtime overlays. It has root-layout paths and is locally package-verified. SHA-256 checksums cover the HACS ZIP and reused signed pack assets.
- Typecheck, frontend tests, focused tank tests, and production build pass; see the exact commit's GitHub Actions run for CI results.
- Published for testing as `v4.0.2.4b9`, targeting commit `a2beda03ad64706192307e8cbec9846f0d39e579`. GitHub Actions run `46149460927` passed. Stable v4.0.2.3 remains available for rollback. No Home Assistant plan/configuration was changed, no pump was operated, and Home Assistant was not restarted.

## Visibility restoration follow-up

The b9 visibility persistence fix addresses a dropped update during lazy viewer startup: `fp3d-view3d.updated()` ignores the persisted visibility change while `viewer` is not yet available, while `start()` used to build the initial scene with inspection off. `LazyVisibility` now retains the latest requested state through lazy module loading, rejects stale async requests, and is applied by `fp3d-view3d.start()` after the initial scene is ready. Scene rebuilds read the same state before producing floor cutaways and tank meshes. This uses lifecycle ordering and state generations, not delays.

Automated regression coverage: `frontend/src/lazy-visibility.test.ts` covers enabled preference restoration after delayed module load, the latest disabled request winning a pending enable, and the state read by rebuilds. Local browser validation from `.local/prod-repro/prod-latest-20261128/` passed enabled normal/hard refresh, disabled refresh, disconnection/reopen, floor/Apart/Stacked changes and Focus Tank followed by refresh. The production copy still has two unique tanks with two cutouts and 48 outline vertices. A local-only second floor at +3.2 m added one tank and one cutout; Apart separated it to about +5.59 m, Stacked placed it at about +3.48 m, and hard refresh recreated all three tank bodies and all three cutouts. Current upstream baseline and signed Water Systems Pack release 4 are unchanged. b9 is published as a testing prerelease and has not been deployed; no SSH writes, Home Assistant configuration/plan changes, pump operations or restarts occurred.
