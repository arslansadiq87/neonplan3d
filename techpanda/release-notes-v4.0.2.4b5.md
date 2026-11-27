# NeonPlan 3D v4.0.2.4b5 testing prerelease

Testing prerelease based on upstream `v4.0.2`, continuing the TechPanda `v4.0.2.4b4` line. Stable rollback remains `v4.0.2.3`. This release contains the Smart RGB rendering refinement from commit `665e18f0`; it does not replace or alter the existing b4 release.

## Changes

- Smart RGB fixtures use neutral charcoal housings and diffusers while switched off, unbound, unavailable, or without valid active state.
- Active RGB animations use narrower ribbons aligned to the physical LED strips, avoiding the previous broad background highlight.
- Existing CCTV, networking, water systems, solar panels, furniture IDs, pack signing restrictions, and upstream compatibility are retained.
- The signed Smart RGB furniture pack remains release 2; its pack ID and both item IDs are unchanged.

## Verification

- Frontend regression: 766/766 passed under `TZ=UTC`; typecheck passed.
- Production build passed existing bundle budgets: main 795.3/870 KB, 3D viewer 939.6/940 KB, editor 1154.0/1160 KB, infrastructure 46.7/240 KB, Smart RGB lazy module 52.8/240 KB.
- Linux-compatible HACS ZIP contains 84 root-level files. POSIX paths, extraction inventory and file hashes passed local verification.
- Smart RGB furniture pack release 2 is reused from b4 and retains its verified signature and SHA-256.
- GitHub CI passed on commit `b4899705` in run [46079840286](https://github.com/arslansadiq87/neonplan3d/actions/runs/46079840286), including frontend regression/typecheck/build freshness, Linux archive verification, backend lint/typecheck/pytest, and signing-key registry verification.
- Home Assistant behavior is represented by synthetic tests only; no live HA configuration, physical lights, deployment, or restart was used.

## Assets

- `neonplan3d.zip`: HACS integration archive, built from upstream `v4.0.2` and the inventoried downstream runtime overlays.
- `techpanda-smart-rgb-lighting-v2.fp3dpack`: signed Smart RGB furniture pack release 2.
- `techpanda-smart-rgb-ha-examples.zip`: optional configuration examples; not installed by this release.
- `SHA256SUMS-v4.0.2.4b5.txt`: SHA-256 checksums for the downloadable assets.

Install through Marketplace/HACS by selecting the TechPanda repository prerelease `v4.0.2.4b5`. The furniture pack can be updated separately through NeonPlan's **Settings → Modules → Import a module…** workflow. Do not install optional YAML examples unless reviewed for the local entities.

Rollback: select stable `v4.0.2.3` in HACS or restore the integration-only backup using the established rollback procedure. This is a testing prerelease, not a stable release.
