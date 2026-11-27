# TechPanda furniture authoring

This directory holds downstream furniture definitions and tooling. It is intentionally outside `custom_components/neonplan3d/`, so upstream updates cannot replace authored geometry.

## Current native pack limits

The v4.0.2 pack schema supports up to 60 parts per item: `box`, `cyl`, and `loft`. Part position, extent, height, top-face taper, local rotation, color/material role, and resize behavior are normalized against the item's dimensions. Items have default width/depth/height in metres; the editor can resize, rotate, and mirror placed furniture. Use the room editor's mount-height property for roof elevation. Entity slots support `open`, `slide`, `spin`, `level`, `blink`, and `glow`; a `level`-bound part is drawn from its base to the sensor's percentage. Supported entity states/attributes are described in `frontend/src/live-parts.ts`.

## Files and commands

- `examples/geometry-playground.source.json` demonstrates the supported primitives, material colors, dimensions, rotation, and a sensor-driven level part. It is tooling verification material, not the rooftop tank.
- `designs/rooftop-water-tank.json` records the unchanged rectangular tank; `designs/water-systems.json` records pack release 3. The editable source `packs/water-tanks.source.json` contains the original rectangular tank plus the cylindrical tank and RO plant.
- `scripts/NeonPlan.Furniture.psm1` exports `Build-NeonFurniture`, `Test-NeonFurniturePack`, and `Preview-NeonFurniturePack`.
- The key is kept at `%USERPROFILE%\Documents\TechPanda\NeonPlan3D\keys\techpanda-ed25519.pem` (or `NEONPLAN_SIGNING_KEY`). The private key is not copied to this tree or pack output. Back up the key securely; losing it prevents signing updates to TechPanda packs.
- Build/sign via the existing `tools/fp3dpack.py` tool. Verification calls the same `verify_pack` implementation used on import. Generated signed files and preview images are placed in ignored `techpanda/furniture/dist/`.
- Preview uses the existing `furniturePreview()` implementation in `frontend/src/viewer/preview.ts`, which renders pack geometry with the integration's Three.js furniture builder; it does not add a second geometry renderer. It requires frontend npm dependencies and a local Chrome or Edge installation.

## Water tank status

Water-tanks pack release 3 keeps the original rectangular tank item definition unchanged and adds **Cylindrical Water Tank** (1.2 x 1.2 x 1.8 m) and **RO Plant** (1.8 x 0.9 x 1.35 m). Both use native pack geometry, standard placement, rotation, duplication and deletion, and the existing mounting-height property. Native vertical cylinders use the smaller width/depth dimension as their diameter, so the cylindrical tank stays circular and its height remains independently resizable.

The rectangular tank defaults to 2 × 1.5 × 1.5 m, dark gray, at 0 m elevation. Width, depth and height are independently adjustable with NeonPlan's regular furniture controls; mounting elevation and rotation use existing editor properties. A `sensor.*` entity can optionally be linked to the Water level slot. Unknown, unavailable or invalid states use NeonPlan's zero fallback. With no entity assigned, the existing renderer leaves the live part in its full rest pose; it does not claim that as a sensor value. No Home Assistant integration changes, new controls or automation were introduced.

Build and verify the signed pack with the existing key and module:

```powershell
Import-Module ./scripts/NeonPlan.Furniture.psm1
Build-NeonFurniture -Source ./techpanda/furniture/packs/water-tanks.source.json -Output ./techpanda/furniture/dist/techpanda-water-tanks-v3.fp3dpack
Test-NeonFurniturePack -Pack ./techpanda/furniture/dist/techpanda-water-tanks-v3.fp3dpack
Preview-NeonFurniturePack -Source ./techpanda/furniture/packs/water-tanks.source.json
```

The preview command renders under `dist/previews/`; this update produces the native cylindrical isometric/top/side, 50%/100% water, elevated, resized views, and RO isometric/front/side/elevated plus a paired utility-scene view under `dist/water-systems-v3-previews/`. Import the signed pack through NeonPlan's furniture pack UI only after the TechPanda public key is in the integration's trusted registry. Do not copy the private key to the pack or server.
