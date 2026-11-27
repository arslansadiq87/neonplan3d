import assert from "node:assert/strict";
import test from "node:test";
import { packType, setPacks, type FurniturePack } from "./packs.ts";
import { defaultSmartRgbConfig, writeSmartRgbConfig, HEX_FRAME_ITEM_ID, TRIANGLE_WALL_ITEM_ID } from "./smart-rgb-config.ts";
import { hexFrameEdges } from "./smart-rgb-geometry.ts";
import { drawSmartRgb } from "./smart-rgb-runtime.ts";
import type { Furniture } from "./model.ts";
import type { HassEntity } from "./types.ts";

const id = "studio.techpanda.smart_rgb_lighting";
const pack: FurniturePack = {
  id, name: "test", publisher: "test", licensee: null,
  items: [HEX_FRAME_ITEM_ID, TRIANGLE_WALL_ITEM_ID].map(itemId => ({ id: itemId, name: { en: itemId }, size: [2.4, 0.12, 2.4], mount: "wall", parts: [{ shape: "box", x: 0, z: 0, w: 0.001, d: 0.001, y: 0, h: 0.001, color: "#151b24" }] })),
};
setPacks([pack]);
const furniture = (itemId: string): Furniture => ({ id: "rgb-1", type: packType(id, itemId), x: 2, z: 3, rotation: 0, w: 2.4, d: 0.12, h: 2.4, variant: null, mirror: false, mount_y: 1.8 });
const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state: s, attributes });

test("hex renderer preserves open frames, shares common sides and follows HA power, colour and brightness", () => {
  const item = furniture(HEX_FRAME_ITEM_ID);
  const config = defaultSmartRgbConfig("hex"); config.bindings.pattern = "input_select.hex_led_pattern"; writeSmartRgbConfig(item, config);
  const active = { "light.hex_led": state("light.hex_led", "on", { rgb_color: [255, 0, 0], brightness: 128 }), "input_select.hex_led_pattern": state("input_select.hex_led_pattern", "solid") };
  const faces = drawSmartRgb(item, 1.8, active)!;
  const edges = hexFrameEdges(config.hex!.cells, config.hex!.sideLength);
  assert.equal(edges.length, 15);
  assert.equal(faces.filter(face => face.color === "#800000").length, edges.length * 10);
  assert.ok(faces.every(face => face.a[1] >= 1.799));
  const off = drawSmartRgb(item, 1.8, { "light.hex_led": state("light.hex_led", "off") })!;
  const offDiffusers = off.filter(face => face.color !== "#172432" && face.color !== "#263c50");
  assert.ok(offDiffusers.length > 0 && offDiffusers.every(face => Math.max(...face.color.slice(1).match(/../g)!.map(part => parseInt(part, 16))) <= 24));
  assert.ok(off.some(face => face.color === "#172432"));
  const unavailable = drawSmartRgb(item, 1.8, { "light.hex_led": state("light.hex_led", "unavailable") })!;
  assert.ok(unavailable.every(face => face.color !== "#800000"));
});

test("triangular renderer uses dark grooved panels and only emits configured zone edges", () => {
  const item = furniture(TRIANGLE_WALL_ITEM_ID);
  const config = defaultSmartRgbConfig("triangles"); writeSmartRgbConfig(item, config);
  const active = { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "#00ff00", brightness_ha: 255, pattern_name: "SOLID" }] }) };
  const faces = drawSmartRgb(item, 1.8, active)!;
  const ledEdges = Object.values(config.wall!.edgeZones).filter(zone => zone === 0).length;
  assert.equal(faces.filter(face => face.color === "#00ff00").length, ledEdges * 10);
  assert.ok(faces.some(face => face.color === "#30353b"));
  const off = drawSmartRgb(item, 1.8, { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: false, color: "#00ff00", brightness_ha: 255 }] }) })!;
  assert.ok(!off.some(face => face.color === "#00ff00"));
  assert.ok(off.some(face => face.color === "#172432"));
});

test("an explicitly configured zone light overrides controller telemetry, including off and unavailable states", () => {
  const item = furniture(TRIANGLE_WALL_ITEM_ID);
  const config = defaultSmartRgbConfig("triangles");
  config.wall!.zones[0].entity = "light.rgb_zone_wall";
  writeSmartRgbConfig(item, config);
  const sensor = state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "00ff00", brightness_ha: 255, pattern_name: "SOLID" }] });
  const off = drawSmartRgb(item, 1.8, { "sensor.rgb_controller_status": sensor, "light.rgb_zone_wall": state("light.rgb_zone_wall", "off", { rgb_color: [0, 255, 0], brightness: 255 }) })!;
  assert.ok(!off.some(face => face.color === "#00ff00"));
  const unavailable = drawSmartRgb(item, 1.8, { "sensor.rgb_controller_status": sensor, "light.rgb_zone_wall": state("light.rgb_zone_wall", "unavailable", { rgb_color: [0, 255, 0], brightness: 255 }) })!;
  assert.ok(!unavailable.some(face => face.color === "#00ff00"));
  const on = drawSmartRgb(item, 1.8, { "sensor.rgb_controller_status": sensor, "light.rgb_zone_wall": state("light.rgb_zone_wall", "on", { rgb_color: [0, 255, 0], brightness: 255, effect: "solid" }) })!;
  assert.ok(on.some(face => face.color === "#00ff00"));
});

test("lazy viewer renderer draws installed pack items without a shared main-bundle pack registry", () => {
  const item = furniture(HEX_FRAME_ITEM_ID);
  writeSmartRgbConfig(item, defaultSmartRgbConfig("hex"));
  setPacks([]); // the independently bundled lazy module starts with its own empty pack registry
  const faces = drawSmartRgb(item, 1.8, { "light.hex_led": state("light.hex_led", "on", { rgb_color: [40, 205, 240], brightness: 255 }) });
  assert.ok(faces && faces.length > 100);
  assert.ok(faces.some(face => face.color === "#172432"));
  setPacks([pack]);
});
