import assert from "node:assert/strict";
import test from "node:test";
import { furnitureSelectionGhost } from "./viewer3d.ts";

test("router and access point keep selection without the generic wireframe ghost", () => {
  assert.equal(furnitureSelectionGhost("pack:studio.techpanda.cctv_network:router"), false);
  assert.equal(furnitureSelectionGhost("pack:studio.techpanda.cctv_network:access_point"), false);
  assert.equal(furnitureSelectionGhost("pack:studio.techpanda.cctv_network:poe_switch_8"), true);
  assert.equal(furnitureSelectionGhost("chair"), true);
});
