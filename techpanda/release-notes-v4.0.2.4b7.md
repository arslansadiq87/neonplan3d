# TechPanda testing prerelease 4.0.2.4b7

This prerelease is based on the official NeonPlan 3D v4.0.2 release. It adds the downstream underground concrete water tank inspection workflow while retaining the existing rectangular and cylindrical rooftop tanks, RO plant, CCTV/network infrastructure, Smart RGB furniture, and official signing keys.

## Underground concrete water tank

- Adds a default-off, persisted **Underground tanks** Show-menu toggle.
- When enabled, creates temporary localized cutouts in the Ground Floor above negative-height tanks, revealing actual tank geometry and valid bound water levels. Disabling inspection restores the unmodified floor mesh. No floor or room is added.
- Supports percentage, calibrated water-depth, and measured water-volume sensors with units and optional capacity calibration. Invalid or unavailable readings hide the fill.
- Adds editor information for internal dimensions, concrete thickness assumptions, burial depth, capacity, current measured or estimated volume, remaining capacity, and read-only pump/low/overflow states. It does not operate pumps.
- Includes a signed release-4 Water Systems pack. Existing furniture IDs remain stable.

The production browser harness and screenshots are generated with `node techpanda/furniture/underground-tank-viewer-preview.mjs`. This is a testing prerelease for manual review. It has not been published. Do not use it to modify production Home Assistant plans or operate devices without separate authorization.
