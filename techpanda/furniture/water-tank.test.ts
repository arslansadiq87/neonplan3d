import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindValue, liveGroups } from "../../frontend/src/live-parts.ts";
import { fitParts } from "../../frontend/src/pack-scale.ts";
import { furnitureSize, packType, setPacks } from "../../frontend/src/packs.ts";
import type { PackItem } from "../../frontend/src/packs.ts";
import { GeoBuffer, LineBuffer } from "../../frontend/src/viewer/geo.ts";
import { pushFurniture, pushPackLive } from "../../frontend/src/viewer/furniture.ts";
import type { Furniture } from "../../frontend/src/model.ts";

const source = JSON.parse(readFileSync(new URL("./packs/water-tanks.source.json", import.meta.url), "utf8"));
const pack = { id: source.id, name: source.name, items: source.items };
const item = source.items[0] as PackItem;
const type = packType(pack.id, item.id);

test("tank uses native defaults and independently resizes all three dimensions", () => {
  setPacks([pack]);
  assert.deepEqual(furnitureSize(type), [2, 1.5, 1.5]);
  for (const [w, d, h, expectedW, expectedD, expectedH] of [
    [3, 1.5, 1.5, 0.735, 0.042, 0.9825],
    [2, 2.25, 1.5, 0.49, 0.063, 0.9825],
    [2, 1.5, 2.25, 0.49, 0.042, 1.47375],
  ] as const) {
    const fill = fitParts(item, w, d, h).find((part) => part.bind?.kind === "level")!;
    assert.ok(Math.abs(fill.w * w - expectedW) < 1e-8);
    assert.ok(Math.abs(fill.d * d - expectedD) < 1e-8);
    assert.ok(Math.abs(fill.h * h - expectedH) < 1e-8);
  }
});

test("level binding, unknown states, absent entity, and native live geometry behave as expected", () => {
  const live = item.parts.filter((part) => part.bind);
  const [group] = liveGroups(live).values();
  assert.equal(group.bind.kind, "level");
  assert.equal(bindValue("level", undefined), 0);
  for (const [state, expected] of [["0", 0], ["25", 0.25], ["50", 0.5], ["75", 0.75], ["100", 1]] as const) {
    assert.equal(bindValue("level", { entity_id: "sensor.tank", state, attributes: { unit_of_measurement: "%" } }), expected);
  }
  for (const state of ["unknown", "unavailable", "n/a"]) {
    assert.equal(bindValue("level", { entity_id: "sensor.tank", state, attributes: {} }), 0);
  }
  const buffer = new GeoBuffer();
  const lines = new LineBuffer();
  const liveModel = pushPackLive(buffer, item, 2, 1.5, 1.5, "level|level|||", {}, lines);
  assert.ok(liveModel);
  assert.equal(liveModel.bind.kind, "level");
  assert.ok(buffer.count > 0);
});

test("native furniture geometry honors mounting elevation and rotation", () => {
  setPacks([pack]);
  const make = (rotation: number, mount_y: number): Furniture => ({
    id: "tank", type, x: 0, z: 0, rotation, w: 2, d: 1.5, h: 1.5, variant: null, mount_y,
  } as Furniture);
  const render = (f: Furniture) => {
    const buffer = new GeoBuffer();
    pushFurniture(buffer, new LineBuffer(), new GeoBuffer(), f, f.mount_y ?? 0, true);
    return buffer.p;
  };
  const base = render(make(0, 0));
  const turned = render(make(90, 0));
  assert.equal(base.length, turned.length);
  assert.notDeepEqual(base, turned);
  for (const elevation of [3.35, 6.71]) {
    const lifted = render(make(0, elevation));
    assert.ok(Math.abs(Math.min(...lifted.filter((_, i) => i % 3 === 1)) - elevation) < 1e-5);
  }
});
