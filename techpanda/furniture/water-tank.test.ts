import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindValue, liveGroups } from "../../frontend/src/live-parts.ts";
import { fitParts } from "../../frontend/src/pack-scale.ts";
import { emptyBuilding, newFloor, type Furniture } from "../../frontend/src/model.ts";
import { furnitureSize, packType, setPacks } from "../../frontend/src/packs.ts";
import type { PackItem } from "../../frontend/src/packs.ts";
import { GeoBuffer, LineBuffer } from "../../frontend/src/viewer/geo.ts";
import { pushFurniture, pushPackLive } from "../../frontend/src/viewer/furniture.ts";
import { floorCutouts, readTankWater } from "../../frontend/src/underground-inspection.ts";

const source = JSON.parse(readFileSync(new URL("./packs/water-tanks.source.json", import.meta.url), "utf8"));
const pack = { id: source.id, name: source.name, items: source.items };
const item = source.items.find((candidate: { id: string }) => candidate.id === "rectangular_water_tank") as PackItem;
const cylindrical = source.items.find((candidate: { id: string }) => candidate.id === "cylindrical_water_tank") as PackItem;
const roPlant = source.items.find((candidate: { id: string }) => candidate.id === "ro_plant") as PackItem;
const underground = source.items.find((candidate: { id: string }) => candidate.id === "underground_concrete_water_tank") as PackItem;
const type = packType(pack.id, item.id);

test("water system pack adds new ids while preserving the rectangular tank identity", () => {
  assert.equal(source.release, 4);
  assert.equal(source.id, "studio.techpanda.water_tanks");
  assert.equal(item.id, "rectangular_water_tank");
  assert.deepEqual(item.slots?.map((slot: { id: string }) => slot.id), ["level"]);
  assert.equal(type, "pack:studio.techpanda.water_tanks:rectangular_water_tank");
  assert.equal(
    createHash("sha256").update(JSON.stringify(item)).digest("hex"),
    "b6cb01ef96423b5642113098c21b29cabc2593c9eb3577260931bc9982c90dcc",
    "the existing rectangular tank definition must remain unchanged",
  );
  assert.deepEqual(source.items.map((entry: { id: string }) => entry.id), ["rectangular_water_tank", "cylindrical_water_tank", "ro_plant", "underground_concrete_water_tank"]);
  assert.equal(packType(pack.id, cylindrical.id), "pack:studio.techpanda.water_tanks:cylindrical_water_tank");
  assert.equal(packType(pack.id, roPlant.id), "pack:studio.techpanda.water_tanks:ro_plant");
  assert.equal(createHash("sha256").update(JSON.stringify(cylindrical)).digest("hex"), "08ba5c7fb53832834af0914330b12473ab40960e4b1aa650d2490a15caa6f504");
  assert.equal(createHash("sha256").update(JSON.stringify(roPlant)).digest("hex"), "020d91c2b2e119070651beb039e4cac5ebf3b5ae94bc907cff9e0e4693eafac3");
  assert.deepEqual(underground.size, [3, 2, 2]);
  assert.equal(packType(pack.id, underground.id), "pack:studio.techpanda.water_tanks:underground_concrete_water_tank");
  assert.deepEqual(underground.slots?.map((slot: { id: string }) => slot.id), ["level", "depth", "volume", "pump", "low", "overflow"]);
});

test("existing placed item types and unrelated plan metadata survive the normal JSON save/reload round-trip", () => {
  const building = emptyBuilding();
  const roof = newFloor("roof", "Roof", 3.35);
  roof.furniture = [item, cylindrical, roPlant].map((packItem, index) => ({
    id: `placed-${index}`, type: packType(pack.id, packItem.id), x: index, z: 0, rotation: 0,
    w: packItem.size[0], d: packItem.size[1], h: packItem.size[2], variant: null, mount_y: 0,
  } as Furniture));
  building.floors = [roof];
  building.mods = { "techpanda.cctv_network": { connections: [{ id: "keep-me" }] } } as never;
  const restored = JSON.parse(JSON.stringify(building));
  assert.deepEqual(restored.floors[0].furniture.map((f: Furniture) => f.type), [
    "pack:studio.techpanda.water_tanks:rectangular_water_tank",
    "pack:studio.techpanda.water_tanks:cylindrical_water_tank",
    "pack:studio.techpanda.water_tanks:ro_plant",
  ]);
  assert.deepEqual(restored.mods, building.mods);
});

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

test("underground tank bottom-origin mounting keeps its top at ground level at -2 m", () => {
  setPacks([pack]);
  const f = { id: "buried", type: packType(pack.id, underground.id), x: 0, z: 0, rotation: 0, w: 3, d: 2, h: 2, variant: null, mount_y: -2 } as Furniture;
  const buffer = new GeoBuffer();
  pushFurniture(buffer, new LineBuffer(), new GeoBuffer(), f, f.mount_y!, true);
  const ys = buffer.p.filter((_, i) => i % 3 === 1);
  assert.ok(Math.abs(Math.min(...ys) + 2) < 1e-5);
  assert.ok(Math.abs(Math.max(...ys)) < 1e-5);
  const building = emptyBuilding();
  const ground = newFloor("ground", "Ground Floor", 0);
  ground.furniture = [f];
  building.floors = [ground];
  const restored = JSON.parse(JSON.stringify(building));
  assert.equal(restored.floors.length, 1, "no underground floor is added");
  assert.equal(restored.floors[0].id, "ground");
  assert.equal(restored.floors[0].furniture[0].mount_y, -2);
});

test("underground tank cutouts follow rotated negative-height tanks and ignore surface tanks", () => {
  const ground = newFloor("ground", "Ground Floor", 0);
  const base = { id: "tank", type: packType(pack.id, underground.id), x: 1, z: 2, rotation: 0, w: 3, d: 2, h: 2, variant: null };
  ground.furniture = [{ ...base, mount_y: -2 }, { ...base, id: "tank-2", x: 5, rotation: 90, mount_y: -2 }, { ...base, id: "roof-tank", mount_y: 0 }] as Furniture[];
  const holes = floorCutouts(ground);
  assert.equal(holes.length, 2);
  assert.notDeepEqual(holes[0], holes[1]);
});

test("underground water readings are explicit and support percent, calibrated depth, and calibrated volume", () => {
  const f = { id: "tank", type: packType(pack.id, underground.id), x: 0, z: 0, rotation: 0, w: 3, d: 2, h: 2, variant: null,
    binds: { level: "sensor.tank_level" }, mods: { [pack.id]: { waterMode: "percent" } } } as Furniture;
  const states = (entity: string, state: string, unit = "%") => ({ [entity]: { entity_id: entity, state, attributes: { unit_of_measurement: unit } } as never });
  assert.equal(readTankWater(f, {}) , null);
  assert.equal(readTankWater(f, states("sensor.tank_level", "unknown")), null);
  assert.equal(readTankWater(f, states("sensor.tank_level", "not-a-number")), null);
  for (const [n, pct] of [[0, 0], [25, 0.25], [50, 0.5], [75, 0.75], [100, 1]] as const) {
    const reading = readTankWater(f, states("sensor.tank_level", String(n)))!;
    assert.equal(reading.fraction, pct);
    assert.equal(reading.measuredVolumeL, null);
  }
  f.binds = { depth: "sensor.tank_depth" };
  f.mods![pack.id] = { waterMode: "depth", depthUnit: "cm", usableDepthM: 1.44 };
  assert.equal(readTankWater(f, states("sensor.tank_depth", "72", "cm"))?.fraction, 0.5);
  f.binds = { volume: "sensor.tank_volume" };
  f.mods![pack.id] = { waterMode: "volume", volumeUnit: "m³", maxCapacityL: 6000 };
  const volume = readTankWater(f, states("sensor.tank_volume", "1.5", "m³"))!;
  assert.equal(volume.fraction, 0.25);
  assert.equal(volume.measuredVolumeL, 1500);
  assert.equal(volume.capacityIsCalibrated, true);
});

test("cylindrical tank keeps circular cylinder geometry and supports percentage level binding", () => {
  setPacks([pack]);
  assert.deepEqual(furnitureSize(packType(pack.id, cylindrical.id)), [1.2, 1.2, 1.8]);
  assert.deepEqual(cylindrical.slots?.map((slot: { id: string; domains: string[] }) => [slot.id, slot.domains]), [["level", ["sensor"]]]);
  const shell = cylindrical.parts.find((part) => part.shape === "cyl" && part.y > 0.05)!;
  assert.equal(shell.w, shell.d);
  const level = cylindrical.parts.find((part) => part.bind?.kind === "level")!;
  assert.equal(level.bind?.slot, "level");
  for (const [state, expected] of [["0", 0], ["25", 0.25], ["50", 0.5], ["75", 0.75], ["100", 1]] as const) {
    assert.equal(bindValue("level", { entity_id: "sensor.tank", state, attributes: { unit_of_measurement: "%" } }), expected);
  }
  for (const state of ["unknown", "unavailable"]) assert.equal(bindValue("level", { entity_id: "sensor.tank", state, attributes: {} }), 0);
  for (const [w, d, h] of [[1.8, 1.8, 1.8], [1.2, 1.2, 2.3], [1.5, 1.5, 1.8]] as const) {
    const fill = fitParts(cylindrical, w, d, h).find((part) => part.bind?.kind === "level")!;
    assert.ok(fill.w > 0 && fill.d > 0 && fill.h > 0);
  }
  const rendered = new GeoBuffer();
  const live = pushPackLive(rendered, cylindrical, 1.2, 1.2, 1.8, "level|level|||", {}, new LineBuffer());
  assert.ok(live && rendered.count > 0);
});

test("RO plant has readable native geometry, editable dimensions, rotation and mounting elevation", () => {
  setPacks([pack]);
  const roType = packType(pack.id, roPlant.id);
  assert.deepEqual(furnitureSize(roType), [1.8, 0.9, 1.35]);
  assert.ok(roPlant.parts.length <= 60);
  assert.ok(roPlant.parts.some((part) => part.shape === "cyl" && part.axis === "x"));
  assert.ok(roPlant.parts.some((part) => part.shape === "box"));
  const make = (rotation: number, mount_y: number): Furniture => ({
    id: "ro", type: roType, x: 0, z: 0, rotation, w: 2.2, d: 1.1, h: 1.6, variant: null, mount_y,
  } as Furniture);
  const render = (f: Furniture) => {
    const buffer = new GeoBuffer();
    pushFurniture(buffer, new LineBuffer(), new GeoBuffer(), f, f.mount_y ?? 0, true);
    return buffer.p;
  };
  const base = render(make(0, 0));
  assert.ok(base.length > 0);
  assert.notDeepEqual(base, render(make(90, 0)));
  const lifted = render(make(0, 3.35));
  const minY = Math.min(...lifted.filter((_, i) => i % 3 === 1));
  assert.ok(minY >= 3.35 && minY < 3.45);
});
