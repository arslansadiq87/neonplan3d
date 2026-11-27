import assert from "node:assert/strict";
import test from "node:test";
import { gradientSamples, hexFrameEdges, hexFrameJoints, limitedTriangleGrooves, triangleGrooves, trianglePanelEdges, triangularPanels } from "./smart-rgb-geometry.ts";

test("honeycomb frames reuse their shared bars and connector joints", () => {
  const one = hexFrameEdges([{ q: 0, r: 0 }], 1);
  assert.equal(one.length, 6);
  const two = hexFrameEdges([{ q: 0, r: 0 }, { q: 1, r: 0 }], 1);
  assert.equal(two.length, 11);
  assert.equal(two.filter(edge => edge.owners.length === 2).length, 1);
  const three = hexFrameEdges([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], 1);
  assert.equal(three.length, 15);
  assert.equal(three.filter(edge => edge.owners.length === 2).length, 3);
  assert.equal(hexFrameJoints(three).length, 13);
});

test("triangle panels share diagonal edges and keep their triangular footprint", () => {
  const panels = triangularPanels(2, 3, 1);
  assert.equal(panels.length, 12);
  assert.ok(panels.every(panel => panel.vertices.length === 3));
  const edges = trianglePanelEdges(panels);
  assert.ok(edges.some(edge => edge.owners.length === 2));
  assert.ok(edges.some(edge => edge.owners.length === 1));
});

test("grooves clip to a triangle and colour samples interpolate along a bar", () => {
  const grooves = triangleGrooves([[0, 0], [2, 0], [1, Math.sqrt(3)]], 0, 0.2, 0.04);
  assert.ok(grooves.length > 4);
  assert.ok(grooves.every(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0));
  assert.deepEqual(gradientSamples([[0, 10, 20], [100, 110, 120]], 3), [[0, 10, 20], [50, 60, 70], [100, 110, 120]]);
  assert.deepEqual(gradientSamples([], 2), [[0, 0, 0], [0, 0, 0]]);
});

test("large panel faces bound groove geometry while preserving an even distribution", () => {
  const vertices = [[0, 0], [2, 0], [0, 2]] as const;
  const all = triangleGrooves(vertices, 90, 0.01);
  const limited = limitedTriangleGrooves(vertices, 90, 0.01, 0, 16);
  assert.ok(all.length > 16);
  assert.equal(limited.length, 16);
  assert.deepEqual(limited[0], all[0]);
  assert.deepEqual(limited[15], all.at(-1));
});
