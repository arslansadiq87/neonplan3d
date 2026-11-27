import assert from "node:assert/strict";
import test from "node:test";
import { packType, setPacks, type FurniturePack } from "./packs.ts";
import { defaultSmartRgbConfig, writeSmartRgbConfig, HEX_FRAME_ITEM_ID, TRIANGLE_WALL_ITEM_ID } from "./smart-rgb-config.ts";
import { hexFrameEdges } from "./smart-rgb-geometry.ts";
import { drawSmartRgb, smartRgbScene } from "./smart-rgb-runtime.ts";
import type { Building, Furniture } from "./model.ts";
import type { HassEntity, HomeAssistant } from "./types.ts";

const id = "studio.techpanda.smart_rgb_lighting";
const pack: FurniturePack = {
  id, name: "test", publisher: "test", licensee: null,
  items: [HEX_FRAME_ITEM_ID, TRIANGLE_WALL_ITEM_ID].map(itemId => ({ id: itemId, name: { en: itemId }, size: [2.4, 0.12, 2.4], mount: "wall", parts: [{ shape: "box", x: 0, z: 0, w: 0.001, d: 0.001, y: 0, h: 0.001, color: "#151b24" }] })),
};
setPacks([pack]);
const furniture = (itemId: string): Furniture => ({ id: "rgb-1", type: packType(id, itemId), x: 2, z: 3, rotation: 0, w: 2.4, d: 0.12, h: 2.4, variant: null, mirror: false, mount_y: 1.8 });
const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state: s, attributes });
const home = (states: Record<string, HassEntity>): HomeAssistant => ({ states } as HomeAssistant);
const plan = (item: Furniture, elevation = 0): Building => ({ floors: [{ id: "test-floor", elevation, furniture: [item] }] } as Building);
const midpoint = (a: number[], b: number[]) => a.map((value, index) => (value + b[index]) / 2);
const pointDistance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function ledEndpoints(faces: ReturnType<typeof drawSmartRgb>, color: string): number[][][] {
  const selected = (faces ?? []).filter(face => face.color === color);
  const out: number[][][] = [];
  for (let i = 0; i + 1 < selected.length; i += 10) out.push([midpoint(selected[i].a, selected[i + 1].c), midpoint(selected[i].b, selected[i].c)]);
  return out;
}

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
  const offDiffusers = off.filter(face => face.color !== "#24282e" && face.color !== "#292d33");
  assert.ok(offDiffusers.length > 0 && offDiffusers.every(face => Math.max(...face.color.slice(1).match(/../g)!.map(part => parseInt(part, 16))) <= 24));
  assert.ok(off.every(face => ["#24282e", "#292d33", "#080808"].includes(face.color)));
  assert.ok(off.some(face => face.color === "#24282e"));
  const unavailable = drawSmartRgb(item, 1.8, { "light.hex_led": state("light.hex_led", "unavailable") })!;
  assert.ok(unavailable.every(face => face.color !== "#800000"));
});

test("wall renderer emits only configured LED edges with no visible triangular construction", () => {
  const item = furniture(TRIANGLE_WALL_ITEM_ID);
  const config = defaultSmartRgbConfig("triangles");
  const selected = Object.keys(config.wall!.edgeZones)[0];
  config.wall!.edgeZones = { [selected]: 0 };
  writeSmartRgbConfig(item, config);
  const active = { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "#00ff00", brightness_ha: 255, pattern_name: "SOLID" }] }) };
  const faces = drawSmartRgb(item, 1.8, active)!;
  assert.equal(faces.length, 20); // one thin rail and one diffuser bar
  assert.equal(faces.filter(face => face.color === "#00ff00").length, 10);
  assert.ok(faces.some(face => face.color === "#24282e"));
  assert.ok(faces.every(face => !["#252b32", "#2e343b", "#333a43", "#39414a", "#12171d", "#505860"].includes(face.color)));
  const off = drawSmartRgb(item, 1.8, { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: false, color: "#00ff00", brightness_ha: 255 }] }) })!;
  assert.ok(!off.some(face => face.color === "#00ff00"));
  assert.ok(off.some(face => face.color === "#24282e"));
  assert.equal(off.length, 20);
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
  assert.ok(faces.some(face => face.color === "#24282e"));
  setPacks([pack]);
});

test("unbound, missing, unavailable, off and zero-brightness hex states stay dark with no animations", () => {
  const item = furniture(HEX_FRAME_ITEM_ID); const config = defaultSmartRgbConfig("hex"); writeSmartRgbConfig(item, config);
  const staleStatus = { "sensor.hex_led_status_raw": state("sensor.hex_led_status_raw", "true", { power: true, color: "#ff0000", brightness: 255 }) };
  const unbound = structuredClone(config); unbound.bindings.light = ""; writeSmartRgbConfig(item, unbound);
  assert.ok(drawSmartRgb(item, 1.8, staleStatus)!.every(face => face.color !== "#ff0000"));
  assert.equal(smartRgbScene(plan(item), home(staleStatus)).length, 0);
  writeSmartRgbConfig(item, config);
  for (const light of [undefined, state("light.hex_led", "unknown"), state("light.hex_led", "unavailable"), state("light.hex_led", "off"), state("light.hex_led", "on", { rgb_color: [255, 0, 0], brightness: 0, effect: "rainbow" })]) {
    const states = light ? { ...staleStatus, "light.hex_led": light } : staleStatus;
    assert.ok(drawSmartRgb(item, 1.8, states)!.every(face => face.color !== "#ff0000"));
    assert.equal(smartRgbScene(plan(item), home(states)).length, 0);
  }
});

test("hex animated flow aligns to the physical LED faces and uses native wall mount defaults once", () => {
  const config = defaultSmartRgbConfig("hex"); config.bindings.pattern = "input_select.hex_led_pattern";
  const states = {
    "light.hex_led": state("light.hex_led", "on", { rgb_color: [32, 163, 192], brightness: 255 }),
    "input_select.hex_led_pattern": state("input_select.hex_led_pattern", "confetti"),
  };
  for (const mount of [0, 0.9144, 1.5, 2.5, null]) {
    const item = { ...furniture(HEX_FRAME_ITEM_ID), rotation: 37, mirror: true, w: 2.75, d: 0.14, h: 2.05, mount_y: mount };
    writeSmartRgbConfig(item, config);
    const base = mount ?? 1;
    const endpoints = ledEndpoints(drawSmartRgb(item, base, states), "#20a3c0");
    const lines = smartRgbScene(plan(item, 2.75), home(states));
    assert.equal(lines.length, hexFrameEdges(config.hex!.cells, config.hex!.sideLength).length);
    for (const line of lines) {
      assert.equal(line.kind, "line");
      if (line.kind !== "line") continue;
      assert.equal(line.width, 0.25);
      assert.ok(line.points[0][1] > base);
      for (const point of [line.points[0], line.points.at(-1)!]) {
        const closest = Math.min(...endpoints.flatMap(pair => pair.map(vertex => pointDistance(vertex, point))));
        assert.ok(closest < 0.001, `animated line endpoint diverged from its bar centerline by ${closest}m at mount ${mount}`);
      }
    }
  }
});

test("solid, off, unavailable and stale global multizone states do not animate or light zones", () => {
  const item = furniture(TRIANGLE_WALL_ITEM_ID); const config = defaultSmartRgbConfig("triangles");
  const edge = Object.keys(config.wall!.edgeZones)[0]; config.wall!.edgeZones = { [edge]: 0 }; writeSmartRgbConfig(item, config);
  const online = state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "#33aaff", brightness_ha: 255, pattern_name: "RAINBOW", leds: 30 }] });
  const animated = { "sensor.rgb_controller_status": online };
  assert.equal(smartRgbScene(plan(item), home(animated)).length, 1);
  const solid = { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "#33aaff", brightness_ha: 255, pattern_name: "SOLID" }] }) };
  assert.equal(smartRgbScene(plan(item), home(solid)).length, 0);
  const stale = { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "unavailable", { zones: [{ id: 0, on: true, color: "#33aaff", brightness_ha: 255, pattern_name: "RAINBOW" }] }) };
  assert.equal(smartRgbScene(plan(item), home(stale)).length, 0);
  const off = { "light.rgb_lights": state("light.rgb_lights", "off"), "sensor.rgb_controller_status": online };
  assert.equal(smartRgbScene(plan(item), home(off)).length, 0);
  assert.ok(drawSmartRgb(item, 1.8, off)!.every(face => ["#24282e", "#080808"].includes(face.color)));
  const zero = { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "#33aaff", brightness_ha: 0, pattern_name: "RAINBOW" }] }) };
  assert.equal(smartRgbScene(plan(item), home(zero)).length, 0);
});

test("wall LED strips and animated flows use the same wall plane and configured edge set", () => {
  const item = { ...furniture(TRIANGLE_WALL_ITEM_ID), rotation: 73, mirror: true, w: 3.2, d: 0.18, h: 2.0, mount_y: 0.9144 };
  const config = defaultSmartRgbConfig("triangles"); const selected = Object.keys(config.wall!.edgeZones)[0]; config.wall!.edgeZones = { [selected]: 0 }; writeSmartRgbConfig(item, config);
  const states = { "sensor.rgb_controller_status": state("sensor.rgb_controller_status", "online", { zones: [{ id: 0, on: true, color: "#28cdf0", brightness_ha: 255, pattern_name: "CONFETTI", leds: 8 }] }) };
  const faces = drawSmartRgb(item, item.mount_y!, states)!;
  const endpoints = ledEndpoints(faces, "#28cdf0");
  const lines = smartRgbScene(plan(item, 3.2), home(states));
  assert.equal(lines.length, 1);
  assert.equal(faces.filter(face => face.color === "#28cdf0").length, 80);
  assert.ok(faces.filter(face => face.color === "#24282e").every(face => [face.a, face.b, face.c].every(point => point[2] > item.z)), "strips must sit on the room-facing mounting surface");
  const line = lines[0]; assert.equal(line.kind, "line"); if (line.kind !== "line") return; assert.equal(line.width, 0.25);
  for (const point of [line.points[0], line.points.at(-1)!]) {
    const closest = Math.min(...endpoints.flatMap(pair => pair.map(vertex => pointDistance(vertex, point))));
    assert.ok(closest < 0.001, `wall animated strip diverged from its physical LED centerline by ${closest}m; point=${point.join(",")}; endpoints=${JSON.stringify(endpoints)}`);
  }
});
