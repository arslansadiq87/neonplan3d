# NeonPlan 3D v4.0.2.4b3 testing prerelease

HACS prerelease: `v4.0.2.4b3`, based on upstream `v4.0.2` and the TechPanda `v4.0.2.4b2` line. Stable rollback remains `v4.0.2.3`. This is a testing prerelease and has not been published.

## Included

- The Smart RGB furniture pack retains pack ID `studio.techpanda.smart_rgb_lighting`, release 1, and both existing item IDs.
- The lazy-loaded Smart RGB manager provides geometry layout, entity binding, per-zone mapping, and controls through Home Assistant services.
- Hex frame and triangular panel geometry now renders in the actual NeonPlan 3D viewer. The lazy runtime no longer depends on a pack registry instance shared with the main bundle; this fixed a confirmed defect where the furniture resolved in the manager but disappeared in 3D.
- Power, brightness, colour, pattern and zone state drive synthetic viewer geometry; off/unavailable states are dim. Layout edits save and reload through the normal plan path.
- All prior CCTV/network, water systems, solar panel, signing-key and upstream compatibility work is retained.

## Verification

- Frontend typecheck passed. Full frontend suite: 761/761 passing with `TZ=UTC`. Production build passed all unchanged bundle budgets: viewer 939.6/940 KB, editor 1154.0/1160 KB, Smart RGB lazy bundle 52.7/240 KB, Infrastructure Manager 46.7/240 KB.
- Headless Chrome used the production preview bundles, actual NeonPlan panel/viewer, a synthetic three-floor plan, and mocked Home Assistant states/services. It rendered 1,714 hex faces and 13,296 triangular-wall faces. UI actions issued expected `light.turn_off`, `light.turn_on`, `select.select_option`, `input_select.select_option`, and `input_text.set_value` service calls. A layout edit survived mock save/reload. Apart and Stacked controls and individual floor/room navigation were exercised. Browser console and request-failure lists were empty. Screenshots were visually inspected at `techpanda/furniture/dist/smart-rgb-viewer-previews/`.
- The simulation does not verify live HA entities, controller network access, firmware responses, or physical lighting. Read-only SSH reached the HA host but the Core API endpoint and controller hostnames did not return usable API responses; do not treat entities or live command behavior as verified. No light was operated, configuration installed, or service restarted.
- The optional Home Assistant YAML was reviewed against the supplied configuration and firmware source and syntax parsed, but was not installed or validated with Home Assistant. `hex-led-controls.yaml` is a reference copy of the user's existing config; do not install a duplicate. `smart-rgb-zone-controls.yaml` is optional and requires checking the entity registry and packages for duplicate ids first.
- Trusted-key check passed against upstream `v4.0.2`: all three official keys remain unchanged and TechPanda remains furniture-only. The signed pack validated; the test rejected a modified payload as `bad_signature`.
- HACS archive `techpanda/dist/neonplan3d.zip` contains 84 root-level files, including `frontend/neonplan3d-smart-rgb.js` (53,979 bytes). POSIX archive paths, Linux-style extraction, CRC, inventory, and SHA-256 file comparisons passed against the upstream release plus downstream overlays.
- HACS ZIP SHA-256: `03477a2c332741011f36597ca2d71e2c190a33f2c14b78fe44a9453842954e02`.
- Signed furniture pack `techpanda/furniture/dist/techpanda-smart-rgb-lighting-v1.fp3dpack` SHA-256: `ea083f395350979b46a1fb13e216cd11cdd679746ca1d8b05b9a108bd2acb3a7`.
- Optional YAML examples `techpanda/dist/techpanda-smart-rgb-ha-examples.zip` SHA-256: `8ba74ff767827fdac2b37dbfad616c466604972dc703dcc5e91fa4353e9c08cd`. Checksums are also in `techpanda/dist/SHA256SUMS.txt`.
- GitHub CI passed on commit `c4a1fe9131652bb52dcc9ddbff3eb19893ea7968` (frontend, Python backend, trusted-key registry, and Linux HACS archive jobs). A GitHub draft prerelease is prepared and remains unpublished pending approval.

## Installation and configuration

1. Keep the HACS source `arslansadiq87/neonplan3d` and stable rollback `v4.0.2.3`. Back up Home Assistant and the integration using the normal HA backup workflow before selecting prereleases.
2. In HACS, open NeonPlan 3D, enable prereleases for the TechPanda fork, and install `v4.0.2.4b3`. Restart only during your approved maintenance window; installation itself is left to the user.
3. Import the signed `techpanda-smart-rgb-lighting-v1.fp3dpack` through **NeonPlan 3D > Extensions > Packs > Import furniture pack**. Place either fixture from the furniture library.
4. Open **NeonPlan 3D > Extensions > TechPanda Smart RGB Lighting** to edit geometry, assign entities, map wall edges to firmware zones, and use Home Assistant light/select/helper controls. The hex controls default to `light.hex_led`, `sensor.hex_led_status_raw`, `input_select.hex_led_pattern`, `input_number.hex_led_speed`, and `input_text.hex_led_color`; these bindings can be changed in the manager.
5. Existing single-zone YAML is already represented by the supplied configuration. Do not install `hex-led-controls.yaml` as another package. Per-zone lights are optional; install `smart-rgb-zone-controls.yaml` only after confirming its entity ids and unique ids are absent.

Rollback: use HACS to return to stable `v4.0.2.3`. If the integration directory must be restored from an integration-only backup, use the separately gated restore procedure; any restart remains a separate action.

