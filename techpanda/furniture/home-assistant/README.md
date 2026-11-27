# Smart RGB Home Assistant YAML references

These files are separate from the HACS integration and are not installed automatically. No production Home Assistant configuration was changed.

- `hex-led-controls.yaml` is the configuration supplied by the user and already represents the single-zone controller setup. It defines `rest_command.hex_led_set`, `sensor.hex_led_status_raw`, `light.hex_led`, three template sensors, three helpers, and four automations. Do not add another copy alongside that configuration: it would duplicate definitions. Keep it as a reference or use it only on a clean setup after checking every key and entity id.
- `smart-rgb-zone-controls.yaml` is optional. It assumes the existing `sensor.rgb_controller_status`, `light.rgb_lights`, and `select.rgb_pattern`. It adds one REST command, five zone lights, and ten number helpers. Before installing, search the entity registry and all YAML packages for `rgb_zone_wall`, `rgb_zone_monitors`, `rgb_zone_pc_case`, `rgb_zone_ceiling`, `rgb_zone_moon_globe`, `smart_rgb_zone_command`, and corresponding speed/count ids. Do not install if any already exist.

The zone YAML uses only firmware fields checked in the ESP32-Smart-LEDs source: `zone`, `cmd`, `pattern`, `brightness_ha`, RGB channels, `speed`, and `count`. The firmware source reports zone state through `/api/status`. The controller and the running Home Assistant instance could not be reached from the read-only test session, so entity availability, active YAML duplication, and live command acceptance remain unverified. YAML parsing is not a Home Assistant configuration check.

The Smart RGB manager itself calls Home Assistant entity services only. It never sends controller HTTP requests from the browser.
