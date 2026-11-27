# NeonPlan 3D v4.0.2.4b6 testing prerelease

Testing prerelease based on upstream `v4.0.2`, continuing the TechPanda 4.0.2 downstream line. Stable rollback remains `v4.0.2.3`. This release includes Smart RGB fixes from commit `6e505712`; earlier prereleases remain unchanged.

## Changes

- New Smart RGB fixtures start unbound; previously saved explicit entity bindings and zone assignments are retained.
- Unbound, missing, unavailable, off, zero-brightness, and removed bindings leave the physical LED strips neutral charcoal and stop animation.
- Valid powered-on solid states color only the LED surfaces. Active effects use thin, geometry-aligned, non-additive ribbons confined to the LED strips; these decorative fixtures do not illuminate walls, floors, or rooms.
- Smart RGB furniture pack release 2 is reused without changing its pack ID or either furniture item ID.
- CCTV, networking, water systems, solar panels, upstream compatibility, and official signing keys are preserved.

## Verification

- Production browser verification uses synthetic Home Assistant entities; no live Home Assistant configuration or physical lighting hardware was accessed.
- Frontend regression: 769/769 passed with UTC; typecheck and production build passed.
- Bundle budgets: main 795.4/870 KB, viewer 939.6/940 KB, editor 1154.1/1160 KB, Smart RGB lazy bundle 52.3/240 KB.
- Smart RGB pack signature verified: 2 items, release 2. HACS ZIP verified for POSIX paths, Linux extraction, inventory, and file hashes.
- GitHub CI and backend tests are required to pass on the final release commit before publication.

## Assets

- `neonplan3d.zip`: HACS integration ZIP, containing the manifest and frontend resources at archive root.
- `techpanda-smart-rgb-lighting-v2.fp3dpack`: TechPanda-signed Smart RGB furniture pack release 2.
- `techpanda-smart-rgb-ha-examples.zip`: optional configuration examples; not installed by this release.
- `SHA256SUMS-v4.0.2.4b6.txt`: SHA-256 hashes of the three downloadable assets.

Install through the TechPanda Marketplace/HACS repository by selecting prerelease `v4.0.2.4b6`. Import the furniture pack in NeonPlan under **Settings → Modules → Import a module…**. Review optional YAML examples before use.

Rollback: select stable `v4.0.2.3` through HACS. This is a testing prerelease, not a stable release.
