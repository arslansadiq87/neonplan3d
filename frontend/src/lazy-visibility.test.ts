import assert from "node:assert/strict";
import { test } from "node:test";
import { LazyVisibility } from "./lazy-visibility.ts";

test("restores persisted visibility after lazy renderer loading and reapplies it on scene rebuild", async () => {
  let resolveLoad!: () => void;
  let loaded = false;
  let sceneReady = false;
  let builtVisible = false;
  let rebuilds = 0;
  const state = new LazyVisibility(
    () => new Promise<void>((resolve) => (resolveLoad = () => { loaded = true; resolve(); })),
    (visible) => {
      assert.ok(loaded);
      assert.ok(sceneReady);
      builtVisible = visible;
      rebuilds++;
    },
  );

  const restore = state.set(true);
  assert.equal(state.visible, false);
  assert.equal(builtVisible, false);
  sceneReady = true;
  resolveLoad();
  await restore;
  assert.equal(state.visible, true);
  assert.equal(builtVisible, true);
  assert.equal(rebuilds, 1);

  // A new floor scene reads the same authoritative value when its geometry is rebuilt.
  builtVisible = state.sceneRebuilt();
  assert.equal(builtVisible, true);
  assert.equal(rebuilds, 1);
  await state.set(false);
  assert.equal(state.visible, false);
  assert.equal(builtVisible, false);
  assert.equal(rebuilds, 2);
});

test("a newer disabled preference wins over a pending lazy enable", async () => {
  let resolveLoad!: () => void;
  const applied: boolean[] = [];
  const state = new LazyVisibility(
    () => new Promise<void>((resolve) => (resolveLoad = resolve)),
    (visible) => applied.push(visible),
  );
  const enable = state.set(true);
  await state.set(false);
  resolveLoad();
  await enable;
  assert.equal(state.visible, false);
  assert.deepEqual(applied, []);
});
