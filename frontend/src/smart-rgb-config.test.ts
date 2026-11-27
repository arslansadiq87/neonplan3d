import assert from "node:assert/strict";
import test from "node:test";
import { defaultSmartRgbConfig, readSmartRgbConfig, sanitizeSmartRgbConfig, SMART_RGB_MODULE_ID, writeSmartRgbConfig } from "./smart-rgb-config.ts";
import type { Furniture } from "./model.ts";

const furniture = (type: string): Furniture => ({ id: "light-1", type, x: 1, z: 2, rotation: 0, w: 2, d: 0.12, h: 2, variant: null });

test("hex light defaults use the provided entity IDs and a deduplicated three-cell frame layout", () => {
  const item = furniture("pack:studio.techpanda.smart_rgb_lighting:hexagonal_rgb_frame_lights");
  const config = readSmartRgbConfig(item)!;
  assert.equal(config.bindings.light, "light.hex_led");
  assert.equal(config.bindings.pattern, "input_select.hex_led_pattern");
  assert.equal(config.hex?.cells.length, 3);
  assert.equal(config.hex?.sideLength, 0.42);
});

test("wall light uses actual five firmware zone IDs without a one-panel-per-zone assumption", () => {
  const item = furniture("pack:studio.techpanda.smart_rgb_lighting:multizone_geometric_rgb_wall_lights");
  const config = readSmartRgbConfig(item)!;
  assert.equal(config.bindings.status, "sensor.rgb_controller_status");
  assert.equal(config.wall?.zones.length, 5);
  assert.equal(config.wall?.zones[0].name, "Wall");
  assert.ok(Object.values(config.wall?.edgeZones ?? {}).every(zone => zone === 0));
  assert.ok(Object.keys(config.wall?.edgeZones ?? {}).length > 1);
});

test("a saved sparse or empty edge map is complete and does not regain default LED assignments", () => {
  const item = furniture("pack:studio.techpanda.smart_rgb_lighting:multizone_geometric_rgb_wall_lights");
  const config = defaultSmartRgbConfig("triangles");
  config.wall!.edgeZones = {};
  writeSmartRgbConfig(item, config);
  assert.deepEqual(readSmartRgbConfig(item)?.wall?.edgeZones, {});
  config.wall!.edgeZones = { [Object.keys(defaultSmartRgbConfig("triangles").wall!.edgeZones)[0]]: 2 };
  writeSmartRgbConfig(item, config);
  assert.deepEqual(readSmartRgbConfig(item)?.wall?.edgeZones, config.wall!.edgeZones);
});

test("configuration stays on a furniture item through ordinary clone and resize operations", () => {
  const item = furniture("pack:studio.techpanda.smart_rgb_lighting:multizone_geometric_rgb_wall_lights");
  const config = readSmartRgbConfig(item)!;
  config.wall!.rows = 4;
  writeSmartRgbConfig(item, config);
  const duplicate = structuredClone(item);
  duplicate.id = "light-2";
  duplicate.w = 4;
  duplicate.h = 2.5;
  assert.equal(readSmartRgbConfig(duplicate)?.wall?.rows, 4);
  assert.ok(duplicate.mods?.[SMART_RGB_MODULE_ID]);
});

test("invalid edge mappings are dropped and layout dimensions are clamped", () => {
  const config = defaultSmartRgbConfig("triangles");
  config.wall!.rows = 99;
  config.wall!.edgeZones = { "missing": 0, ...config.wall!.edgeZones, "bogus": 10 };
  const clean = sanitizeSmartRgbConfig(config);
  assert.equal(clean.wall?.rows, 16);
  assert.ok(!("missing" in (clean.wall?.edgeZones ?? {})));
  assert.ok(!("bogus" in (clean.wall?.edgeZones ?? {})));
});
