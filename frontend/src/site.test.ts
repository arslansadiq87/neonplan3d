import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBuilding, newFloor, type Building } from "./model.ts";
import { composeSite, placePoint, siteOwner } from "./site.ts";
import { groundFace, roofFaces } from "./solar.ts";
import { buildFloorGeometry } from "./viewer/build.ts";

function house(): Building {
  const eg = newFloor("eg", "EG", 0);
  eg.rooms = [{ id: "wohnen", name: "Wohnen", area_id: null, points: [[0, 0], [6, 0], [6, 4], [0, 4]], floor_material: "wood" }];
  return { ...emptyBuilding(), floors: [eg, newFloor("og", "OG", 2.75)] };
}

function garden(): Building {
  const gh = newFloor("gh", "Gartenhaus", 0);
  gh.rooms = [{ id: "werk", name: "Werkstatt", area_id: "garten", points: [[0, 0], [4, 0], [4, 3], [0, 3]], floor_material: "wood" }];
  gh.openings = [{ id: "tuer", room_id: "werk", edge: 0, offset: 1, width: 0.9, type: "door" } as never];
  gh.furniture = [{ id: "bank", type: "workbench", x: 1, z: 1, rotation: 0 } as never];
  gh.placements = [{ entity_id: "light.werk", x: 2, z: 1.5, rotation: 0 } as never];
  return { ...emptyBuilding(), floors: [gh] };
}

test("a point turns clockwise in the plan like the editor's 90° turn, then moves to its place", () => {
  assert.deepEqual(placePoint([1, 0], { on: true, x: 10, y: 5, rot: 90 }), [10, 6]);
  assert.deepEqual(placePoint([0, 1], { on: true, x: 10, y: 5, rot: 90 }), [9, 5]);
  assert.deepEqual(placePoint([2, 3], { on: true, x: 0, y: 0, rot: 0 }), [2, 3]);
});

test("the garden house joins the house's ground floor at its place, its ids prefixed with its plan", () => {
  const b = composeSite(house(), [{ id: "pgarten", building: garden(), site: { on: true, x: 12, y: 8, rot: 90 } }]);
  assert.deepEqual(
    b.floors.map((f) => f.id),
    ["eg", "og"],
  );
  const eg = b.floors[0];
  assert.deepEqual(
    eg.rooms.map((r) => r.id),
    ["wohnen", "pgarten:werk"],
  );
  // (0,0) → (12,8), (4,0) → (12,12)
  assert.deepEqual(eg.rooms[1].points.slice(0, 2), [
    [12, 8],
    [12, 12],
  ]);
  const door = eg.openings.find((o) => o.id === "pgarten:tuer")!;
  assert.equal(door.room_id, "pgarten:werk");
  const bench = eg.furniture.find((m) => m.id === "pgarten:bank")!;
  assert.deepEqual([bench.x, bench.z, bench.rotation], [11, 9, 90]);
  // a device keeps its entity, it only stands elsewhere
  assert.deepEqual(eg.placements.at(-1), { entity_id: "light.werk", x: 10.5, z: 10, rotation: 90 });
  // the house is left as it was
  assert.equal(house().floors[0].rooms.length, 1);
});

test("a plan not on the property (a holiday flat) stays out; a floor at a height of its own is a floor of its own", () => {
  const flat = garden();
  flat.floors[0].elevation = 6;
  const b = composeSite(house(), [
    { id: "pferien", building: garden(), site: null },
    { id: "pturm", building: flat, site: { on: true, x: 0, y: 20, rot: 0 } },
  ]);
  assert.deepEqual(
    b.floors.map((f) => f.id),
    ["eg", "og", "pturm:gh"],
  );
});

test("a tapped room of the property view belongs to its plan", () => {
  assert.deepEqual(siteOwner("pgarten:werk", "main"), { plan: "pgarten", id: "werk" });
  assert.deepEqual(siteOwner("wohnen", "main"), { plan: "main", id: "wohnen" });
});

test("every building keeps its own roof: both become sections, the garden house's turned and moved with it", () => {
  const h = house();
  h.settings.roof = { ...h.settings.roof, type: "gable", pitch: 35, overhang: 0.4 };
  const g = garden();
  g.settings.roof = { ...g.settings.roof, type: "gable", pitch: 30, overhang: 0.3 };
  const b = composeSite(h, [{ id: "pgarten", building: g, site: { on: true, x: 12, y: 8, rot: 90 } }]);
  const secs = b.settings.roof.sections ?? [];
  assert.equal(b.settings.roof.type, "custom");
  assert.ok(secs.some((x) => !x.id.startsWith("pgarten:")), "the house's own roof");
  const own = secs.filter((x) => x.id.startsWith("pgarten:"));
  assert.ok(own.length >= 1, "the garden house's roof");
  // turned by 90° about its origin and moved: its pivot lies at the garden house's place
  assert.equal(own[0].rotation, 90);
  assert.ok(own[0].pivot![0] > 9 && own[0].pivot![0] < 12.5, String(own[0].pivot));
  // a plan without a roof brings none
  g.settings.roof = { ...g.settings.roof, type: "none" };
  const none = composeSite(h, [{ id: "pgarten", building: g, site: { on: true, x: 12, y: 8, rot: 90 } }]);
  assert.ok((none.settings.roof.sections ?? []).every((x) => !x.id.startsWith("pgarten:")));
});

test("Property View carries a secondary plan's roof solar field onto its placed roof and keeps live string bindings", () => {
  const main = house();
  main.settings.roof = { ...main.settings.roof, type: "custom", sections: [{ id: "main_roof", x0: 0, z0: 0, x1: 6, z1: 4, shape: "gable", axis: "x", eave_a: 2.5, eave_b: 2.5, pitch_a: 30, pitch_b: 30, base: 2.5 }] };
  const side = garden();
  side.settings.roof = {
    ...side.settings.roof,
    type: "custom",
    sections: [{ id: "workshop_roof", x0: 0, z0: 0, x1: 4, z1: 3, shape: "gable", axis: "x", eave_a: 2.5, eave_b: 2.5, pitch_a: 30, pitch_b: 30, base: 2.5 }],
    solar: [{ id: "array", face: "workshop_roof:a", u: 0.2, v: 0.2, rows: 1, cols: 2, portrait: true, string: "string" }],
    strings: [{ id: "string", name: "Roof array", entity: "sensor.solar_power", inverter: "inverter" }],
  };
  const result = composeSite(main, [{ id: "pgarten", building: side, site: { on: true, x: 12, y: 8, rot: 90 } }]);
  const field = result.settings.roof.solar?.find((x) => x.id === "pgarten:array");
  assert.ok(field, "secondary-plan solar fields are retained in the property roof");
  assert.equal(field.face, "pgarten:workshop_roof:a", "the field follows its placed roof section");
  assert.equal(field.string, "pgarten:string");
  assert.deepEqual(result.settings.roof.strings?.find((x) => x.id === "pgarten:string"), {
    id: "pgarten:string",
    name: "Roof array",
    entity: "sensor.solar_power",
    inverter: "pgarten:inverter",
  });
  const face = roofFaces(result).find((x) => x.key === field.face);
  assert.ok(face, "the remapped face resolves for the native roof solar renderer");
});

test("Property View preserves a secondary plan's ground-face rooftop array position, rotation and floor-relative height", () => {
  const main = house();
  const side = garden();
  side.floors[0].elevation = 2.75;
  side.settings.roof.solar = [{ id: "array", face: "ground", u: 1, v: 2, base: 3.2, rotation: 0, rows: 1, cols: 2, portrait: true }];
  const result = composeSite(main, [{ id: "pgarten", building: side, site: { on: true, x: 12, y: 8, rot: 90 } }]);
  const field = result.settings.roof.solar?.find((x) => x.id === "pgarten:array");
  assert.ok(field);
  assert.equal(field.face, "ground");
  assert.deepEqual([field.u, field.v, field.rotation, field.base], [10, 9, 90, 5.95]);
  assert.equal(field.siteFloorId, "og", "the array follows the source plan's elevation group when floors are apart");
  const floor = result.floors.find((x) => x.id === field.siteFloorId)!;
  const geometry = buildFloorGeometry(floor, result.settings.wall_exterior, result.settings.wall_interior, [], [{ field, face: groundFace(result, field) }]);
  assert.ok(geometry.solar.getAttribute("position").count > 0, "native floor geometry contains the secondary rooftop array");
});

test("a building without rooms brings no roof to the property: sections left from deleted rooms stay out (#986)", () => {
  // the main plan: rooms deleted, three sections left over; the new plan beside it has one room
  const h = house();
  for (const f of h.floors) f.rooms = [];
  h.settings.roof = { ...h.settings.roof, type: "custom", sections: [{ id: "roof_old", x0: 11, z0: 15, x1: 17, z1: 21, shape: "flat", axis: "z", eave_a: 5.5, eave_b: 5.5, pitch_a: 35, pitch_b: 35, base: 5.5 }] };
  const g = garden();
  g.settings.roof = { ...g.settings.roof, type: "flat", pitch: 35, overhang: 0.4 };
  const b = composeSite(h, [{ id: "pneu", building: g, site: { on: true, x: 0, y: 0, rot: 0 } }]);
  const secs = b.settings.roof.sections ?? [];
  assert.ok(!secs.some((x) => x.id === "roof_old"), "the empty main plan's leftover sections");
  assert.ok(secs.some((x) => x.id.startsWith("pneu:")), "the new plan's own roof");
});
