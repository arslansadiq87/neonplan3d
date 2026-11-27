import { Box3, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { Furniture } from "../../frontend/src/model.ts";
import { bindValue, liveGroups } from "../../frontend/src/live-parts.ts";
import { packType, setPacks } from "../../frontend/src/packs.ts";
import { pushFurniture, pushPackLive } from "../../frontend/src/viewer/furniture.ts";
import { GeoBuffer, LineBuffer } from "../../frontend/src/viewer/geo.ts";
import "../../frontend/src/smart-rgb-runtime.ts";
import { defaultSmartRgbConfig, smartRgbType, writeSmartRgbConfig } from "../../frontend/src/smart-rgb-config.ts";

const status = document.querySelector<HTMLElement>("#status")!;
const title = document.querySelector<HTMLElement>("#title")!;
const sizeText = document.querySelector<HTMLElement>("#size")!;
const image = document.querySelector<HTMLImageElement>("#preview")!;
const params = new URLSearchParams(location.search);
const sourceUrl = params.get("source");
if (!sourceUrl) throw new Error("Missing source URL");

const file = await fetch(sourceUrl).then((response) => {
  if (!response.ok) throw new Error(`Could not load source (${response.status})`);
  return response.json();
});
const pack = file.payload ?? file;
const selectedId = params.get("item");
const item = pack.items?.find((entry: { id: string }) => entry.id === selectedId) ?? pack.items?.[0];
if (!item || !pack.id) throw new Error("Source must contain a NeonPlan furniture pack item");

const [baseW, baseD, baseH] = item.size;
const w = Number(params.get("w") ?? baseW);
const d = Number(params.get("d") ?? baseD);
const h = Number(params.get("h") ?? baseH);
const rotation = Number(params.get("rotation") ?? 0);
const mount = params.get("mount") ?? "0";
const levelParam = params.get("level") ?? "none";
const liveParts = item.parts.filter((part: { bind?: { kind?: string } }) => part.bind?.kind === "level");
const bodyPack = { ...pack, items: pack.items.map((entry: typeof item) => ({ ...entry, parts: entry.parts.filter((part: { bind?: { kind?: string } }) => part.bind?.kind !== "level") })) };
const type = packType(pack.id, item.id);
const furniture: Furniture = { id: "preview", type, x: 0, z: 0, rotation, w, d, h, variant: null, entity: null, power: null, mount_y: Number(mount) } as Furniture;

const rgbKind = smartRgbType(type);
const pattern = params.get("pattern") ?? "rainbow";
const powered = params.get("power") !== "off";
if (rgbKind) {
  const config = defaultSmartRgbConfig(rgbKind);
  if (powered) {
    config.bindings.light = rgbKind === "hex" ? "light.hex_led" : "light.rgb_lights";
    config.bindings.status = rgbKind === "hex" ? "sensor.hex_led_status_raw" : "sensor.rgb_controller_status";
    config.bindings.pattern = rgbKind === "hex" ? "input_select.hex_led_pattern" : "select.rgb_pattern";
    if (rgbKind === "hex") {
      config.bindings.speed = "input_number.hex_led_speed";
      config.bindings.color = "input_text.hex_led_color";
    }
  }
  if (rgbKind === "hex" && params.get("layout") === "expanded") config.hex!.cells = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }];
  if (rgbKind === "triangles") {
    config.wall!.raisedPanels = ["u:0:0", "d:1:1", "u:2:2"];
    if (params.get("zones") === "multi") {
      const keys = Object.keys(config.wall!.edgeZones);
      keys.slice(2, 4).forEach(key => { config.wall!.edgeZones[key] = 1; });
    }
  }
  writeSmartRgbConfig(furniture, config);
}

// Synthetic Home Assistant states exercise the lazy procedural renderer without contacting a controller.
const rgbStates: Record<string, { state: string; attributes: Record<string, unknown> }> = {
  "light.hex_led": { state: powered ? "on" : "off", attributes: { rgb_color: [248, 38, 206], brightness: 220, effect: pattern } },
  "input_select.hex_led_pattern": { state: pattern, attributes: { options: ["rainbow", "solid", "rainbow_glitter", "confetti", "sinelon", "juggle", "bpm"] } },
  "input_number.hex_led_speed": { state: "80", attributes: {} },
  "input_text.hex_led_color": { state: "#16D9F0", attributes: {} },
  "sensor.hex_led_status_raw": { state: "true", attributes: { power: powered, brightness: 220, color: "#16D9F0", pattern, speed_ms: 80 } },
  "light.rgb_lights": { state: powered ? "on" : "off", attributes: { rgb_color: [40, 190, 235], brightness: 220, effect: pattern, effect_list: ["SOLID", "RAINBOW", "CONFETTI"] } },
  "select.rgb_pattern": { state: pattern.toUpperCase(), attributes: { options: ["SOLID", "RAINBOW", "CONFETTI"] } },
  "sensor.rgb_controller_status": { state: "online", attributes: { all: { on: powered, brightness_ha: 220, pattern_name: pattern.toUpperCase() }, patterns: ["SOLID", "RAINBOW", "CONFETTI"], zones: [
    { id: 0, name: "Wall", on: powered, color: "#c742ff", brightness_ha: 220, pattern_name: pattern.toUpperCase(), frame_ms: 45, leds: 120, max_leds: 600 },
    { id: 1, name: "Monitors", on: powered, color: "#27e7c6", brightness_ha: 180, pattern_name: pattern.toUpperCase(), frame_ms: 80, leds: 90, max_leds: 600 },
    { id: 2, name: "PC Case", on: false, color: "#4aaaff", brightness_ha: 0, pattern_name: "SOLID", frame_ms: 60, leds: 60, max_leds: 600 },
    { id: 3, name: "Ceiling", on: false, color: "#ffb44a", brightness_ha: 0, pattern_name: "SOLID", frame_ms: 90, leds: 150, max_leds: 600 },
    { id: 4, name: "Moon Globe", on: false, color: "#b886ff", brightness_ha: 0, pattern_name: "SOLID", frame_ms: 110, leds: 30, max_leds: 600 },
  ] } },
};
(window as typeof window & { __tpSmartRgbStates?: Record<string, { state: string; attributes: Record<string, unknown> }> }).__tpSmartRgbStates = rgbStates;

// Static geometry is built by NeonPlan's furniture builder; live water uses the same pack live-part builder as the viewer.
setPacks([bodyPack]);
const body = new GeoBuffer();
const bodyLines = new LineBuffer();
pushFurniture(body, bodyLines, new GeoBuffer(), furniture, Number(mount), true);
const companionId = params.get("companion");
const companion = pack.items?.find((entry: typeof item) => entry.id === companionId);
if (companion) {
  const companionFurniture: Furniture = {
    id: "preview-companion", type: packType(pack.id, companion.id), x: 1.6, z: 0,
    rotation: 0, w: companion.size[0], d: companion.size[1], h: companion.size[2],
    variant: null, entity: null, power: null, mount_y: 0,
  } as Furniture;
  pushFurniture(body, bodyLines, new GeoBuffer(), companionFurniture, 0, true);
}
setPacks([pack]);

const scene = new Scene();
const bodyMesh = new Mesh(body.geometry(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
scene.add(bodyMesh);
if (bodyLines.p.length) scene.add(new LineSegments(bodyLines.geometry(), new LineBasicMaterial({ vertexColors: true })));

let levelValue = 1; // NeonPlan's native rest pose for an unbound live part is its full original geometry.
let levelLabel = "No sensor (native unbound rest pose)";
if (levelParam !== "none") {
  const state = levelParam === "unknown" ? { entity_id: "sensor.preview", state: "unknown", attributes: {} } : { entity_id: "sensor.preview", state: levelParam, attributes: { unit_of_measurement: "%" } };
  levelValue = bindValue("level", state as never);
  levelLabel = levelParam === "unknown" ? "Unknown sensor state (native zero/fault fallback)" : `Sensor level: ${levelParam}%`;
}

for (const [key, group] of liveGroups(liveParts)) {
  const liveBuffer = new GeoBuffer();
  const liveLines = new LineBuffer();
  const made = pushPackLive(liveBuffer, item, w, d, h, key, furniture, liveLines);
  if (!made) continue;
  const liveRoot = new Group();
  liveRoot.position.set(0, Number(mount), 0);
  liveRoot.rotation.y = -(rotation * Math.PI) / 180;
  const liquid = new Group();
  liquid.position.set(...made.pivot);
  const mesh = new Mesh(liveBuffer.geometry(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  // The viewer's level pose scales around the fill part's bottom pivot in the same way.
  mesh.scale.y = levelParam === "none" ? 1 : Math.max(0.02, Math.min(1, levelValue));
  liquid.add(mesh);
  liveRoot.add(liquid);
  if (liveLines.p.length) liveRoot.add(new LineSegments(liveLines.geometry(), new LineBasicMaterial({ vertexColors: true })));
  scene.add(liveRoot);
  if (group.bind.kind !== "level") continue;
}

const bounds = new Box3().setFromObject(scene);
const center = bounds.getCenter(new Vector3());
const span = bounds.getSize(new Vector3());
const extent = Math.max(span.x, span.y, span.z, 0.1);
const camera = new OrthographicCamera(-extent * 0.9, extent * 0.9, extent * 0.75, -extent * 0.75, 0.01, 100);
const view = params.get("view") ?? "iso";
const directions: Record<string, [number, number, number]> = {
  iso: [2.2, 1.45, 3.2], top: [0, 1, 0.001], front: [0, 0.18, 1], side: [1, 0.18, 0],
};
camera.up.set(0, 1, 0);
if (view === "top") camera.up.set(0, 0, -1);
camera.position.copy(center.clone().add(new Vector3(...(directions[view] ?? directions.iso)).normalize().multiplyScalar(extent * 3.4)));
camera.lookAt(center);
camera.updateProjectionMatrix();
const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(900, 650, false);
renderer.setClearColor(0x101522, 1);
renderer.render(scene, camera);

title.textContent = item.name?.en ?? item.id;
sizeText.textContent = `${w} × ${d} × ${h} m · ${view} view · rotation ${rotation}° · mount ${mount} m · ${levelLabel}${companion ? ` · with ${companion.name?.en ?? companion.id}` : ""}`;
image.src = renderer.domElement.toDataURL("image/png");
image.onload = () => { status.textContent = "Rendered with NeonPlan native furniture and live-part geometry."; };
