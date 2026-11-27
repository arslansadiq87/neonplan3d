# TechPanda Water Systems Pack — Release 3

This is a signed furniture-only update for NeonPlan 3D. It does not change the NeonPlan integration version or require a HACS integration update.

- Existing pack ID: `studio.techpanda.water_tanks`
- Pack release: `3` (schema version remains `1`)
- Items: existing `rectangular_water_tank`, new `cylindrical_water_tank`, new `ro_plant`
- Signed asset: `techpanda-water-tanks-v3.fp3dpack`
- SHA-256: see `water-systems-v3.sha256`

The rectangular tank definition is unchanged. Reimporting release 3 replaces the catalog entry with the same pack ID; placed furniture continues to resolve through its existing item ID. Saved dimensions, rotation, mounting elevation, sensor bindings and other plan data are held in the plan and are not rewritten by pack import. Automated regression coverage checks the backend import path and verifies those saved values survive a release update.

## Update

1. Download `techpanda-water-tanks-v3.fp3dpack` and verify its SHA-256 against `water-systems-v3.sha256`.
2. In NeonPlan open **Extensions → Packs → Import furniture pack** and select the signed file.
3. Confirm the imported pack is **TechPanda Water Tanks**, release 3, with three items. The existing rectangular tank remains the same item; the cylindrical tank and RO plant appear as additional items.
4. Existing placed tanks need no replacement. Their width, depth, height, rotation, mounting elevation and `Water level` sensor binding remain stored on the furniture/plan. The cylindrical tank optionally accepts a `sensor.*` percentage through its `Water level` slot. Unknown/unavailable retains NeonPlan's zero fallback; with no sensor, the level part remains at its native rest pose.

The RO Plant is a physical planning model; no RO telemetry or control system is included. No Home Assistant restart is required for this furniture-only import.