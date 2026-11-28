# TechPanda testing prerelease 4.0.2.4b8

This prerelease is based on the official NeonPlan 3D v4.0.2 release. It fixes underground water tank visibility using the existing furniture type and signed Water Systems Pack release 4. No placed item IDs, dimensions, position, rotation, bindings, capacity settings, or plan data are migrated.

## Underground tank visibility

- Production reproduction found a placed tank with no saved `mount_y`. In b7, this defaulted to floor height, and the temporary floor cutout was only built for tanks with an explicitly negative height. The device-local **Underground tanks** preference defaults off, so the tank is also hidden until inspection is requested.
- During inspection, a tank with no saved elevation now renders below its assigned floor by its existing height. Explicit saved elevations remain authoritative. The matching rotated footprint opens only its local floor area; no room or floor is added and the saved plan is untouched.
- Tank geometry renders in its own translucent layer with a cyan outline. The inspection menu includes **Focus Tank**, which enables inspection, selects the tank's existing floor and centers an elevated isometric camera on the tank.
- An unbound, invalid or unavailable sensor still shows no water fill. Valid readings continue to drive the existing live water geometry.
- The signed Water Systems Pack release 4 is reused unchanged; no furniture pack update is required.

## Compatibility and validation

- Upstream baseline remains v4.0.2. Stable rollback remains v4.0.2.3.
- Existing integration domain, furniture IDs, floor plans, entity bindings and user configurations remain unchanged.
- Published as testing prerelease v4.0.2.4b8 targeting commit `5e38eecc026952a2245b0d7b259710df31e69a9d`. It has not been deployed to Home Assistant or used to operate devices. Production plans and Home Assistant services were not modified.
