# NeonPlan 3D v4.0.2.4b2 testing prerelease

HACS version: `4.0.2.4b2` (`v4.0.2.4b2`). Based on upstream `Mastershort/neonplan3d` v4.0.2 and TechPanda prerelease v4.0.2.4b1. Stable `v4.0.2.3` remains available for rollback.

## Included

- Refined the existing analog/coax and IP bullet camera furniture into cylindrical outdoor-camera models with a dark front lens, subtle IR details, sunshield, rear joint, arm and mounting plate. Existing furniture item ids are unchanged.
- Aligned those bullet cameras' rendered coverage origin to the lens plane while preserving the existing FOV, azimuth, tilt, range and elevation settings. Other camera types retain their prior lens anchor.
- Added three small static status LED details to the Wi-Fi router. They are decorative and are not bound to Home Assistant telemetry or actual router status.
- Suppressed the generic selection wireframe only for the TechPanda Wi-Fi router and access point. Selection state, hit testing and editor operations remain in the existing code paths; other furniture keeps its selection outline.
- Included signed furniture pack release 3, preserving pack id `studio.techpanda.cctv_network`, all 17 furniture item ids, and schema version 1. Existing placed equipment and plan infrastructure metadata keep their existing references; importing this release replaces the prior definition by pack id rather than adding another pack entry.

The CCTV/network manager remains a planning tool. It does not configure physical equipment or read router LED state.

## Verification

- Frontend test suite: 748 passed under UTC. Typecheck and production build passed. Bundles are within existing budgets: main 792.9/870 KB, 3D 939.4/940 KB, editor 1154/1160 KB, Infrastructure Manager 46.7/240 KB.
- Signed furniture pack release 3 passed signature/schema verification. TechPanda public key remains furniture-only and the three official keys are unchanged. Asset SHA-256 values are in `SHA256SUMS-v4.0.2.4b2.txt`.
- Compared with the published b1 HACS ZIP, the b2 archive has the same 83 paths; only the manifest and four affected frontend bundles differ. The signed pack comparison found the same 17 unique item ids; only the two bullet camera definitions and router definition changed. Pack updates replace the existing pack entry by its unchanged pack id.
- Local HACS ZIP path, inventory, extraction and hash verification passed. The TechPanda CI workflow on the release commit runs frontend typecheck/tests/build/bundle freshness, Python backend Home Assistant tests, signing registry checks and Linux archive validation; its run result is linked from the GitHub prerelease.
- Visual model previews use the native NeonPlan furniture builder. The selection policy has a focused regression test. Full production editor pointer-interaction acceptance and live Home Assistant testing were not performed for this release.
- Home Assistant behavior is simulated in local preview tooling where used; no live Home Assistant instance was modified, deployed to or restarted.

## Install

1. In HACS, keep the custom repository `arslansadiq87/neonplan3d`, enable pre-releases for it, and update the existing NeonPlan 3D integration to `v4.0.2.4b2`. Back up Home Assistant before installation.
2. Install the `neonplan3d.zip` HACS asset at the archive root through HACS. During a planned maintenance window, restart Home Assistant from its normal UI.
3. In NeonPlan, open **Extensions > Packs > Import furniture pack** and select `techpanda-cctv-network.fp3dpack`. It has the existing pack id and item ids, so it updates the definitions referenced by placed equipment instead of creating duplicate item types.
4. Continue to use the Infrastructure Manager at **Extensions > TechPanda Infrastructure Manager**. Use a synthetic plan for acceptance testing.

## Rollback

Select stable `v4.0.2.3` for the existing `neonplan3d` integration in HACS. Keep the same HACS repository entry and do not remove/re-add the integration. The furniture pack has no plan metadata migration; if rolling back the integration, the installed release-3 pack can remain in place. Back up plans before testing and use a disposable synthetic plan for acceptance checks.
