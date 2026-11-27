# CCTV and network infrastructure extension

## Local artifacts

- Furniture source: `packs/cctv-network.source.json`.
- Signed furniture-only artifact (ignored local output): `dist/cctv-network.source.fp3dpack`.
- Optional management module source: `cctv-network.module.js`.
- Native model previews (ignored local output): `dist/cctv-network-previews/`.

Rebuild and verify the pack from PowerShell:

```powershell
Import-Module ./scripts/NeonPlan.Furniture.psm1
Build-NeonFurniture -Source ./techpanda/furniture/packs/cctv-network.source.json
Test-NeonFurniturePack -Pack ./techpanda/furniture/dist/cctv-network.source.fp3dpack
Preview-NeonFurniturePack -Source ./techpanda/furniture/packs/cctv-network.source.json
```

The existing TechPanda signing key signs furniture geometry only. The JavaScript module is a separate executable extension and must go through NeonPlan's module import, signature and approval flow as its own artifact; it is deliberately not embedded into the furniture pack. No private key, credentials, passwords or tokens belong in the pack or plan.

## Current implementation

The 17-item furniture pack contains DVR, XVR, NVR, analog and IP bullet cameras, Wi-Fi camera, dome and PTZ cameras, Wi-Fi router, access point, mesh node, Ethernet and PoE switches, fiber ONT, patch panel, rack and PoE injector. Models use pack-native boxes/cylinders, dark navy/charcoal bodies and restrained cyan/green details. NeonPlan supplies placement, rotation, resizing, elevation, selection, duplication, deletion, save/reload and native Home Assistant camera/entity workflows.

`frontend/src/infrastructure.ts` defines an optional v1 infrastructure document suitable for `building.mods["techpanda.infrastructure"]`, with stable device and connection ids; interface/IP/MAC/VLAN data; recorder, camera, router, switch and estimated Wi-Fi coverage metadata; logical links and editable physical route waypoints. Its pure helpers validate IPv4/IPv6/CIDR and MAC addresses, scope duplicate-address warnings by named network, detect dangling/self links, summarize inventory, safely read valid metadata and bound estimated camera coverage. It never applies settings to hardware. Missing HA telemetry remains unknown.

The TechPanda Infrastructure Manager is built as `custom_components/neonplan3d/frontend/neonplan3d-infrastructure.js`, loaded through a cache-busted dynamic import only after the Extensions entry or selected furniture action is used. Its current chunk is 46.7 KB with a 240 KB build guard; the 1160 KB editor cap is unchanged. Its UI provides equipment search/floor filtering, camera FOV/tilt/height/range/color/opacity/ground projection and HA bindings, recorder analog/IP capacities and channel assignment, router/AP mode/DHCP/SSID/bands/channel/width/estimated radius, multi-interface addressing, switch port assignment/speed/VLAN/PoE capability and draw/budget/sensor, IP inventory/CSV, logical topology, connection metadata/editable waypoints, estimated physical length and validation. Changes return through editor events and use the editor undo/save path. The manager recognizes the signed pack's `pack:<pack-id>:<item-id>` equipment types.

## Current limits

This implementation pass adds actual-floor-coordinate route segments for same-floor and cross-floor connections, dashed wireless links and physical length estimates that exclude visual Apart spacing. The optional manager overlay uses a small API on the already loaded viewer, rather than bundling another Three.js copy. Switch validation now checks duplicate/out-of-range ports, duplicate equipment assignments, invalid VLAN/speed/PoE draw, PoE capability and configured budget; recorder validation checks duplicate channel assignments and capacity. Separate persistent controls now exist for CCTV equipment, network equipment, camera coverage, connections, Wi-Fi, device labels and IP labels. The main viewer remains within its established size cap. Browser confirmation of overlay rendering, toggle persistence, Apart/Stacked visual movement and geometry picking remains outstanding. No network scans, management URL requests, physical controls or separate video streaming system are added.

The native selected-furniture form stores data in `Building.mods["techpanda.infrastructure"]` through the editor's undoable change path. IP and MAC input is validated before commit; missing/dangling imported connections are safely ignored. Equipment deletion removes its infrastructure entry and attached links; duplication creates independent device ids and remaps links when both endpoints are duplicated. A bound `camera.*` entity is merged into the camera furniture marker, which retains NeonPlan's native quick menu and licensed stream presentation; no second marker/model is added. Camera furniture metadata drives the 3D frustum and optional ground wedge. Rotation of a selected camera furniture item carries its configured azimuth with it. The color/opacity are visualization estimates, not calibrated optics.

The existing native placed-camera editor already handles HA camera entities, viewing angle/reach/tilt and stream presentation. Use it for live camera behavior; the furniture models are physical planning representations. Additional coverage rendering should reuse the native camera visualization where possible and must preserve separate individual-floor/Property View behavior in Apart and Stacked modes.

## Completion checklist

- [x] 17 signed furniture-only equipment definitions and native-renderer preview images.
- [x] Optional backward-compatible infrastructure metadata namespace; private export/import round-trip test.
- [x] Native context-sensitive selected-equipment form with recorder capacity/channel assignment, analog signal, camera height/azimuth/range and HA entity pickers, router/AP LAN/SSID/radius and switch port count.
- [x] Network address/MAC validation helpers, network-scoped duplicate warnings, dangling-link-safe import, summary helpers and focused tests.
- [x] Device deletion/duplication cleanup and independent metadata identity.
- [x] Separate lazy-loaded infrastructure manager with search, floor filter and configuration sections; editor bundle stays under its original cap.
- [x] Manager camera settings for name/type, height, azimuth, tilt, H/V FOV, range, color/opacity/ground projection and HA bindings.
- [x] Multi-interface IP/subnet/gateway/DNS/VLAN editor and validation warnings; router/AP mode, DHCP, SSID, band/channel/width and estimated coverage metadata.
- [x] Basic per-switch port equipment assignment and PoE capability; recorder capacities and camera channel assignment remain supported.
- [x] IP inventory CSV and logical topology list.
- [x] Recorder channel assignment and capacity warnings; full switch port configuration, configured PoE budget and measured PoE entity display/validation.
- [x] Camera frustum and optional ground coverage rendered from the furniture camera lens pose; individual floor and multi-floor scenes share the same floor-group transforms. Show-menu toggle persists and leaves lighting cones intact.
- [ ] End-to-end interaction evidence for camera rotation, binding, editor preview and coverage in individual/Property View Apart and Stacked modes.
- [x] Metadata editor for logical/physical connections and editable routed floor waypoints; cable lengths use actual floor elevations and do not count visual Apart spacing.
- [x] Same-floor and cross-floor physical cable routes plus dashed wireless links are constructed through the manager overlay API; render and Apart/Stacked behavior still need browser verification.
- [x] Persistent independent Show-menu controls for camera frusta, network connections and estimated Wi-Fi; camera coverage preference remains as before.
- [x] Independent persistent visibility controls for CCTV/network equipment, device labels and IP labels.
- [x] Locate action returns to selected equipment; status/availability bindings display Unknown when the selected entity is missing. Locate/highlight and HA status interaction still need browser evidence.
- [ ] Synthetic multi-floor installation, browser interaction/persistence/validation evidence, and all thirteen requested screenshots.
- [x] Full frontend build and frontend suite after camera scene integration.

Current testing prerelease status: GitHub CI passed on `18149dacba4af42db2609df7e73006a1df6690ca`, including frontend build/tests, Python 3.13 Home Assistant tests, signing registry and Linux archive verification ([run 45985289950](https://github.com/arslansadiq87/neonplan3d/actions/runs/45985289950)). Production build and typecheck passed; 746 frontend tests passed under UTC. Full synthetic multi-floor browser acceptance and all thirteen screenshot requirements remain incomplete. Headless Chrome preview and controller initialize. The Infrastructure Manager loaded the synthetic furniture pack and listed 13 seeded devices after pack-type recognition was fixed; that partial fixture did not include the required second AP. The preview Home Assistant API is simulated, not a live HA integration test. Do not describe untested workflows as verified. No Home Assistant files, production plan, or service were changed; no deployment or restart occurred. Testing prerelease `v4.0.2.4b1` is published; stable `v4.0.2.3` remains available for rollback.

## Safety and portability

Device addresses, MACs, room assignments, camera locations and topology are private plan data. Keep real plans and inventory out of Git/public releases. Shareable plan export removes HA entity ids through NeonPlan's standard entity scrubber; private export retains explicit bindings. Never document credentials. Inventory CSV export is a private local download. The testing prerelease is published, but no Home Assistant floor plan or server was changed and no restart occurred.

## Testing prerelease manual acceptance

Use a disposable synthetic plan, never a production floor plan. Use synthetic addresses and labels. Live entity assignment is optional; if testing a Dahua entity, assign only an existing `camera.*` entity and check that NeonPlan uses its native camera marker/quick menu. The Infrastructure Manager documents settings; it does not configure cameras, routers, switches, VLANs, or recorder hardware.

1. In the NeonPlan panel, open **Extensions** in the top navigation. In the **Packs** section, click **Import furniture pack** and select `techpanda-cctv-network.fp3dpack`. Confirm the pack appears in the furniture library.
2. Open **Editor**. In the furniture library, search for **XVR Hybrid Recorder** and place it in the synthetic utility room. Select it; use its infrastructure action or open **Extensions → TechPanda Infrastructure Manager**.
3. In the manager equipment list, select the XVR. Under **Recorder capacity and channels**, set **Analog channels** and **IP channels**.
4. Back in **Editor**, place four **Analog Coax Bullet Camera** items. Select the XVR in **Infrastructure Manager → Recorders** and assign each analog camera a distinct channel. Check **Warnings** for duplicate or out-of-range assignments.
5. Select each analog camera in **Infrastructure Manager → CCTV cameras**. Set camera name, mounting height, horizontal azimuth, vertical tilt, horizontal/vertical FOV, viewing distance, and optional ground projection. Set **Recorder** and **Recorder channel**.
6. If testing a Dahua camera, choose its existing entity in **Home Assistant camera entity** on that camera's detail form. Confirm the native marker uses that entity. Live stream or Dahua-specific API behavior is not claimed by this prerelease.
7. Place four **IP Bullet Camera** items and configure their camera fields and distinct recorder IP channels in the same forms.
8. Place two **Wi-Fi Router** and two **Wireless Access Point** items. In **Routers & access points**, set name, operating mode, SSID/bands as documentation, and estimated coverage radius. For each interface use **Add interface**, then set **Interface name**, **Kind**, **Assignment**, **IPv4 / IPv6 address**, **Prefix / CIDR**, **MAC address**, **Gateway**, **DNS servers**, **VLAN**, and **Logical network**. Use synthetic addresses.
9. Place an **8-Port PoE Switch**. In **Switches**, configure its port count and PoE budget; assign camera/device IDs to numbered ports, mark PoE-capable ports, and set type, speed, VLAN, and PoE draw. Review **Warnings**.
10. Open **Connections → Add connection**. Choose source, destination, and **Cable type** (Ethernet or coax); clear **Logical topology edge** for physical cable. Edit **Route waypoints floorId,x,z,y; one per line**. For cross-floor cable, add waypoints on both floors and record **Estimated physical length**.
11. Open **3D**, select **All Floors**, then open the eye **Show** menu. Toggle **Camera field of view**, **Network connections**, **CCTV equipment**, **Network equipment**, **Device labels**, **IP labels**, and **Estimated Wi-Fi** individually. Confirm visible geometry/labels change.
12. In **Show**, select **Apart** and **Stacked** in turn; confirm cable length in the manager does not change with visual floor spacing. Select an individual floor from top floor navigation and inspect camera coverage there.
13. Open **Extensions → TechPanda Infrastructure Manager**. Visit **Overview**, **CCTV cameras**, **Recorders**, **Routers & access points**, **Switches**, **IP inventory**, **Connections**, **Topology**, and **Warnings**. Use **Locate in 3D** and check the matching item is selected/highlighted in the editor.
14. Use **Undo** and **Redo**, close the manager, wait for save completion, reload the disposable plan, and check settings persisted. Use the editor's **Export** and **Import** actions to round-trip the plan. Duplicate/delete one configured device and verify independent metadata and connection cleanup.
15. Capture screenshots and log failures. Missing telemetry should remain **Unknown** or **Unconfigured**. Call HA behavior simulated unless tested against a live test instance.

## Testing prerelease rollback

Before installation, create a normal full Home Assistant backup and an integration-only archive using `Backup-NeonPlan` from `scripts/NeonPlan.Dev.psm1`; record its path and SHA-256. If the integration fails after an approved test installation, select prior stable `v4.0.2.3` for the existing `neonplan3d` integration in HACS, or restore the integration-only archive with `Restore-NeonPlan -Backup <archive> -ApproveRemoteWrite`. A Home Assistant restart after rollback is separately approval-gated. Keep the CCTV pack separate; remove it through NeonPlan's pack UI only if the test plan no longer references it. Do not edit `.storage`, plans, or configuration as part of integration rollback.

