import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "../..");
const out = resolve(root, "techpanda/furniture/dist/underground-tank-viewer-previews");
const sourcePath = resolve(root, "techpanda/furniture/packs/water-tanks.source.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://local").pathname)).replace(/^([/\\])+/, "");
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": ({ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" })[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const require = createRequire(resolve(root, "frontend/package.json"));
const puppeteer = require("puppeteer-core");
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error("Chrome/Edge not found; set CHROME_PATH");
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("neonplan3d.news.fun_gifts_winter_2026", "never"));
  const errors = [];
  const failed = [];
  const lazy = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("requestfailed", (request) => failed.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("request", (request) => { if (request.url().includes("underground-inspection")) lazy.push(request.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/index.html?lang=en`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.fp3dPanel?.data?.building, { timeout: 30000 });
  await page.evaluate(() => [...window.fp3dPanel.renderRoot.querySelectorAll("button")].find((button) => /not now/i.test(button.textContent))?.click());
  await page.evaluate(async (pack) => {
    const panel = window.fp3dPanel;
    const hass = panel.hass;
    const original = hass.callWS.bind(hass);
    let saved = null;
    const payload = { id: pack.id, name: pack.name, publisher: pack.publisher, licensee: null, release: pack.release, items: pack.items };
    hass.callWS = async (msg) => {
      if (msg.type === "neonplan3d/packs/list") return { packs: [...(await original(msg)).packs.filter((p) => p.id !== pack.id), payload] };
      if (msg.type === "neonplan3d/building/save") { saved = structuredClone(msg.building); return { revision: 2 }; }
      if (msg.type === "neonplan3d/building/get" && saved) return { building: structuredClone(saved), revision: 2 };
      return original(msg);
    };
    const states = { ...hass.states };
    const put = (id, state, attributes = {}) => { states[id] = { entity_id: id, state, attributes, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(), context: { id: "" } }; };
    put("sensor.underground_tank_level", "50", { unit_of_measurement: "%" });
    put("sensor.underground_tank_level_2", "75", { unit_of_measurement: "%" });
    put("binary_sensor.underground_tank_pump", "on", { device_class: "running" });
    put("binary_sensor.underground_tank_low", "off", { device_class: "problem" });
    put("binary_sensor.underground_tank_overflow", "off", { device_class: "problem" });
    panel.hass = { ...hass, states };
    await panel.data.reloadPacks();
    await panel.updateComplete;
    [...panel.renderRoot.querySelectorAll("button")].find((button) => /not now/i.test(button.textContent))?.click();
    const building = structuredClone(panel.data.building);
    const ground = building.floors[0];
    const first = building.floors[1];
    if (!ground || !first) throw new Error("Production preview needs two demo floors");
    building.floors = [ground, first];
    building.settings.roof.type = "none";
    building.settings.sun_shadow = false;
    const rooms = (id, name) => [{ id, name, area_id: null, points: [[0, 0], [8, 0], [8, 6], [0, 6]], floor_material: "concrete" }];
    for (const [i, floor] of building.floors.entries()) {
      floor.id = i ? "first" : "ground";
      floor.name = i ? "First Floor" : "Ground Floor";
      floor.elevation = i ? 2.8 : 0;
      floor.height = 2.7;
      floor.rooms = rooms(`room-${floor.id}`, "Tank inspection room");
      floor.walls = [];
      floor.placements = [];
      floor.furniture = [];
    }
    const type = `pack:${pack.id}:underground_concrete_water_tank`;
    const tank = (id, x, z, level, rotation = 0) => ({ id, type, x, z, rotation, w: 3, d: 2, h: 2, variant: null, mount_y: -2, binds: { level, pump: "binary_sensor.underground_tank_pump", low: "binary_sensor.underground_tank_low", overflow: "binary_sensor.underground_tank_overflow" } });
    ground.furniture.push(tank("tank-primary", 2.2, 3, "sensor.underground_tank_level"), tank("tank-secondary", 5.7, 3, "sensor.underground_tank_level_2", 90));
    panel._undergroundTanks = false;
    panel._explode = true;
    panel._floorId = null;
    panel._roomId = null;
    panel._clean = false;
    panel.data.edit(building);
    panel.requestUpdate();
    window.__tankSnapshot = structuredClone(building);
    window.__setTankState = (entity, state, attributes = { unit_of_measurement: "%" }) => {
      const next = { ...panel.hass.states, [entity]: { ...panel.hass.states[entity], state, attributes } };
      panel.hass = { ...panel.hass, states: next };
    };
  }, source);
  await page.waitForFunction(() => window.fp3dPanel.renderRoot.querySelector("fp3d-view3d")?.viewer?.floorMap?.has("ground"), { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const state = async () => page.evaluate(() => {
    const viewer = window.fp3dPanel.renderRoot.querySelector("fp3d-view3d").viewer;
    const floor = viewer.floorMap.get("ground");
    return {
      holes: floor.geo.holes.length,
      furniture: floor.geo.furnitureTris.filter((part) => part.id.startsWith("tank-")).map((part) => part.id),
      floorGroupY: floor.group.position.y,
      expectedY: floor.floor.elevation + floor.ty,
      levels: [...viewer.packLive.values()].filter((live) => live.floorId === "ground" && live.bind.kind === "level").map((live) => ({ visible: live.group.visible, target: live.target, value: live.value, scaleY: live.mesh.scale.y })),
    };
  });
  const showMenu = () => page.evaluate(() => [...window.fp3dPanel.renderRoot.querySelectorAll("button")].find((button) => button.textContent.includes("Show"))?.click());
  const enable = async (on) => {
    await showMenu();
    await page.evaluate((wanted) => {
      const p = window.fp3dPanel;
      const button = [...p.renderRoot.querySelectorAll("button")].find((x) => x.textContent.trim() === "Underground tanks");
      if (!button) throw new Error("Underground tanks toggle is missing");
      if ((button.getAttribute("aria-pressed") === "true") !== wanted) button.click();
      const stored = localStorage.getItem("neonplan3d.underground_tanks");
      if (stored !== (wanted ? "1" : "0")) throw new Error(`Inspection preference was not persisted: ${stored}`);
    }, on);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await showMenu();
  };
  const save = async (name) => {
    await page.evaluate((screenshotName) => {
      const p = window.fp3dPanel;
      p._showOpen = false;
      p.requestUpdate();
      const modal = p.renderRoot.querySelector(".fp3d-gift");
      if (modal) [...modal.querySelectorAll("button")].at(-1)?.click();
      if (screenshotName === "tank-configuration-and-capacity") {
        const editor = p.renderRoot.querySelector("fp3d-editor");
        for (const dialog of editor?.renderRoot?.querySelectorAll('[role="dialog"]') ?? []) dialog.remove();
        editor?.renderRoot?.querySelector("fp3d-underground-tank-settings")?.scrollIntoView({ block: "center" });
      }
    }, name);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await page.screenshot({ path: join(out, `${name}.png`) });
  };
  await page.evaluate(() => {
    const p = window.fp3dPanel;
    const v = p.renderRoot.querySelector("fp3d-view3d").viewer;
    const c = v.controls;
    c.view.target.set(4, -0.7, 3);
    c.view.radius = 9;
    c.view.phi = 1.42;
    c.view.theta = -0.3;
    v.invalidate();
  });
  const hidden = await state();
  if (hidden.holes !== 0 || hidden.furniture.length !== 0) throw new Error(`Tanks must be absent with inspection disabled: ${JSON.stringify(hidden)}`);
  await save("01-property-hidden");
  await enable(true);
  const shown = await state();
  if (shown.holes < 2 || shown.furniture.length !== 2) throw new Error(`Cutaway and both tanks must be built: ${JSON.stringify(shown)}`);
  if (Math.abs(shown.floorGroupY - shown.expectedY) > 0.004) throw new Error(`Ground floor transformation applied incorrectly: ${JSON.stringify(shown)}`);
  await save("02-property-cutaway-multiple-tanks");
  const levelCaptures = [];
  for (const [pct, text] of [[0, "0"], [25, "25"], [50, "50"], [75, "75"], [100, "100"]]) {
    await page.evaluate((n) => window.__setTankState("sensor.underground_tank_level", n), text);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const live = await state();
    if (!live.levels.some((level) => level.visible && Math.abs(level.target - pct / 100) < 1e-5)) throw new Error(`Expected live water level ${pct}%: ${JSON.stringify(live.levels)}`);
    if (Math.abs((live.levels[0]?.scaleY ?? NaN) - pct / 100) > 0.01) throw new Error(`Rendered fill geometry did not reach ${pct}%: ${JSON.stringify(live.levels[0])}`);
    levelCaptures.push({ pct, value: live.levels[0].value, scaleY: live.levels[0].scaleY });
    await save(`level-${String(pct).padStart(3, "0")}`);
  }
  await page.evaluate(() => window.__setTankState("sensor.underground_tank_level", "unavailable"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const unavailable = await state();
  if (unavailable.levels[0]?.visible || !unavailable.levels[1]?.visible) throw new Error(`Invalid sensor must hide only its fill: ${JSON.stringify(unavailable.levels)}`);
  await save("level-unavailable");
  await page.evaluate(() => window.__setTankState("sensor.underground_tank_level", "unknown"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  await save("level-unconfigured-or-unknown");
  // Individual Ground Floor view: the upper floor flies away, while the tank remains on the Ground Floor transform.
  await page.evaluate(() => {
    const p = window.fp3dPanel;
    p._floorId = "ground";
    p._explode = false;
    p.requestUpdate();
    const v = p.renderRoot.querySelector("fp3d-view3d");
    v.floorId = "ground";
    v.explode = false;
  });
  await new Promise((resolve) => setTimeout(resolve, 900));
  await save("ground-floor-inspection");
  // Return to All Floors and use the real Show menu controls for Apart and Stacked modes.
  await page.evaluate(() => { window.fp3dPanel._floorId = null; window.fp3dPanel.requestUpdate(); });
  await new Promise((resolve) => setTimeout(resolve, 900));
  await showMenu();
  const apartButton = await page.evaluate(() => [...window.fp3dPanel.renderRoot.querySelectorAll("button")].find((b) => /apart/i.test(b.textContent))?.textContent.trim());
  if (apartButton) await page.evaluate((label) => [...window.fp3dPanel.renderRoot.querySelectorAll("button")].find((b) => b.textContent.trim() === label)?.click(), apartButton);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await showMenu();
  await save("property-apart-inspection");
  const apart = await state();
  if (Math.abs(apart.floorGroupY - apart.expectedY) > 0.004) throw new Error(`Apart transform applied more than once: ${JSON.stringify(apart)}`);
  const stackedButton = await page.evaluate(() => [...window.fp3dPanel.renderRoot.querySelectorAll("button")].find((b) => /stack/i.test(b.textContent))?.textContent.trim());
  if (stackedButton) await page.evaluate((label) => [...window.fp3dPanel.renderRoot.querySelectorAll("button")].find((b) => b.textContent.trim() === label)?.click(), stackedButton);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await showMenu();
  await save("property-stacked-inspection");
  const stacked = await state();
  if (Math.abs(stacked.floorGroupY - stacked.expectedY) > 0.004) throw new Error(`Stacked transform applied more than once: ${JSON.stringify(stacked)}`);
  // Confirm the editor's real tank configuration control and capacity readout are registered and visible.
  await page.evaluate(() => window.__setTankState("sensor.underground_tank_level", "50"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.evaluate(() => window.fp3dPanel.setMode("editor"));
  await page.waitForFunction(() => customElements.get("fp3d-editor"), { timeout: 15000 });
  await page.evaluate(() => {
    const p = window.fp3dPanel;
    const ed = p.renderRoot.querySelector("fp3d-editor");
    ed._floorId = "ground";
    ed._furnitureId = "tank-primary";
    ed.requestUpdate();
  });
  await page.waitForFunction(() => {
    const ed = window.fp3dPanel.renderRoot.querySelector("fp3d-editor");
    return ed?.renderRoot?.querySelector("fp3d-underground-tank-settings");
  }, { timeout: 15000 });
  await page.evaluate(async () => { await window.fp3dPanel.renderRoot.querySelector("fp3d-editor").updateComplete; });
  await save("tank-configuration-and-capacity");
  const editEvidence = await page.evaluate(async () => {
    const panel = window.fp3dPanel;
    const editor = panel.renderRoot.querySelector("fp3d-editor");
    const tank = () => panel.data.building.floors.find((floor) => floor.id === "ground").furniture.find((item) => item.id === "tank-primary");
    const beforeTop = tank().mount_y + tank().h;
    editor.updateFurniture({ w: 3.2, d: 2.1, h: 1.8, mount_y: beforeTop - 1.8, rotation: 90, x: 2.6, z: 3.2 });
    const savedBuilding = structuredClone(panel.data.building);
    await panel.hass.callWS({ type: "neonplan3d/building/save", building: savedBuilding });
    const reloaded = (await panel.hass.callWS({ type: "neonplan3d/building/get" })).building;
    const restoredTank = reloaded.floors.find((floor) => floor.id === "ground").furniture.find((item) => item.id === "tank-primary");
    if (restoredTank.w !== 3.2 || restoredTank.d !== 2.1 || restoredTank.h !== 1.8 || restoredTank.rotation !== 90 || restoredTank.x !== 2.6 || restoredTank.z !== 3.2 || Math.abs(restoredTank.mount_y + restoredTank.h - beforeTop) > 1e-6) throw new Error("Resize, top preservation, rotation, movement or save/reload failed");
    const duplicateBuilding = structuredClone(reloaded);
    duplicateBuilding.floors.find((floor) => floor.id === "ground").furniture.push({ ...structuredClone(restoredTank), id: "tank-duplicate", x: 6.6 });
    await panel.hass.callWS({ type: "neonplan3d/building/save", building: duplicateBuilding });
    const duplicated = (await panel.hass.callWS({ type: "neonplan3d/building/get" })).building;
    if (!duplicated.floors.find((floor) => floor.id === "ground").furniture.some((item) => item.id === "tank-duplicate")) throw new Error("Duplicate tank did not survive save/reload");
    const deleteBuilding = structuredClone(duplicated);
    const furniture = deleteBuilding.floors.find((floor) => floor.id === "ground").furniture;
    deleteBuilding.floors.find((floor) => floor.id === "ground").furniture = furniture.filter((item) => item.id !== "tank-duplicate");
    await panel.hass.callWS({ type: "neonplan3d/building/save", building: deleteBuilding });
    const deleted = (await panel.hass.callWS({ type: "neonplan3d/building/get" })).building;
    if (deleted.floors.find((floor) => floor.id === "ground").furniture.some((item) => item.id === "tank-duplicate")) throw new Error("Deleted tank remained after save/reload");
    return { resizedAndMoved: true, rotation: restoredTank.rotation, preservedTop: restoredTank.mount_y + restoredTank.h, saveReload: true, duplicateReload: true, deleteReload: true };
  });
  const evidence = { hidden, shown, levelCaptures, unavailable, apart, stacked, editEvidence, lazyModuleRequests: lazy.length, pageErrors: errors, failedRequests: failed };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(join(out, "verification.json"), JSON.stringify(evidence, null, 2)));
  console.log(JSON.stringify(evidence, null, 2));
  if (errors.length || failed.length || !lazy.length) throw new Error(`Browser verification logged errors or failed requests: ${JSON.stringify(evidence)}`);
} finally {
  await browser.close();
  server.close();
}
