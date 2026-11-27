import type { Building, Furniture } from "./model.ts";
import { readSmartRgbConfig, smartRgbType, SMART_RGB_DEFAULT_WALL_MOUNT_Y } from "./smart-rgb-config.ts";
import { hexFrameEdges, trianglePanelEdges, triangularPanels, type PlanePoint } from "./smart-rgb-geometry.ts";
import type { HassEntity, HomeAssistant } from "./types.ts";
import type { ScenePiece } from "./modules.ts";

export type SmartRgbFace = { a: [number, number, number]; b: [number, number, number]; c: [number, number, number]; color: string };
type Rgb = [number, number, number];
const hex = (rgb: Rgb) => `#${rgb.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
const normalizedColor = (value: unknown): Rgb | null => {
  if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).map(n => Math.max(0, Math.min(255, Number(n) || 0))) as Rgb;
  if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value)) { const s = value.replace("#", ""); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as Rgb; }
  return null;
};
const UNLIT: Rgb = [8, 8, 8];
const stateAvailable = (state: HassEntity | undefined): state is HassEntity => !!state && !["", "unknown", "unavailable"].includes(state.state.toLowerCase());
const stateValue = (entity: string | undefined, states: Record<string, HassEntity>): string | null => {
  const state = entity ? states[entity] : undefined;
  return stateAvailable(state) ? state.state.trim() : null;
};
const rainbow = (t: number): Rgb => { const h = ((t % 1) + 1) % 1 * 6; const x = 255 * (1 - Math.abs(h % 2 - 1)); return h < 1 ? [255, x, 0] : h < 2 ? [x, 255, 0] : h < 3 ? [0, 255, x] : h < 4 ? [0, x, 255] : h < 5 ? [x, 0, 255] : [255, 0, x]; };
const isRainbowEffect = (pattern: string) => /rainbow|color.?loop|colour.?loop/i.test(pattern);
const isAnimatedEffect = (pattern: string) => !!pattern && !/^solid$/i.test(pattern);
const visualColor = (base: Rgb, pattern: string, t: number, phase: number): Rgb => isRainbowEffect(pattern) ? rainbow(t + phase).map(v => Math.round(v * Math.max(...base) / 255)) as Rgb : base;
function scaledColor(color: Rgb | null, brightness: unknown): Rgb {
  if (!color) return [0, 0, 0];
  const level = Number(brightness);
  const scale = Number.isFinite(level) ? Math.max(0, Math.min(1, level / 255)) : 1;
  return color.map(channel => Math.round(channel * scale)) as Rgb;
}
function reportedStatus(config: ReturnType<typeof readSmartRgbConfig> & {}, states: Record<string, HassEntity>) {
  const state = config.bindings.status ? states[config.bindings.status] : undefined;
  return stateAvailable(state) ? state.attributes : {};
}
function selectedEffect(config: ReturnType<typeof readSmartRgbConfig> & {}, states: Record<string, HassEntity>, ...fallbacks: unknown[]): string {
  const bound = stateValue(config.bindings.pattern, states);
  if (bound) return bound;
  for (const value of fallbacks) if (typeof value === "string" && value.trim() && !["unknown", "unavailable"].includes(value.toLowerCase())) return value.trim();
  return "solid";
}
function hexState(config: ReturnType<typeof readSmartRgbConfig> & {}, states: Record<string, HassEntity>): { on: boolean; rgb: Rgb; pattern: string; speed: number } {
  const light = config.bindings.light ? states[config.bindings.light] : undefined;
  const status = reportedStatus(config, states);
  if (!stateAvailable(light) || light.state !== "on") return { on: false, rgb: UNLIT, pattern: "solid", speed: 100 };
  const colorInput = stateValue(config.bindings.color, states);
  const color = normalizedColor(light.attributes.rgb_color) ?? normalizedColor(light.attributes.color) ?? normalizedColor(status.color) ?? normalizedColor(colorInput);
  const brightness = light.attributes.brightness ?? status.brightness_ha ?? status.brightness ?? 255;
  const rgb = scaledColor(color, brightness);
  const pattern = selectedEffect(config, states, light.attributes.effect);
  const speed = Number(stateValue(config.bindings.speed, states) ?? status.speed_ms ?? 100);
  return { on: !!color && Number(brightness) > 0, rgb, pattern, speed: Number.isFinite(speed) ? speed : 100 };
}
interface ZoneState { on: boolean; rgb: Rgb; pattern: string; speed: number; count: number }
function wallZoneState(config: ReturnType<typeof readSmartRgbConfig> & {}, id: number, states: Record<string, HassEntity>): ZoneState {
  const cfg = config.wall!;
  const zone = cfg.zones.find(item => item.id === id);
  const global = config.bindings.light ? states[config.bindings.light] : undefined;
  if (stateAvailable(global) && global.state === "off") return { on: false, rgb: UNLIT, pattern: "solid", speed: 100, count: zone?.ledCount ?? 8 };
  const status = reportedStatus(config, states);
  const zones = Array.isArray(status.zones) ? status.zones as Record<string, unknown>[] : [];
  const reported = zones.find(value => Number(value.id) === id);
  if (reported && reported.on !== true) return { on: false, rgb: UNLIT, pattern: "solid", speed: 100, count: Number(reported.leds ?? zone?.ledCount ?? 8) };
  const zoneEntity = zone?.entity ? states[zone.entity] : undefined;
  if (zoneEntity && !stateAvailable(zoneEntity)) return { on: false, rgb: UNLIT, pattern: "solid", speed: 100, count: zone?.ledCount ?? 8 };
  if (stateAvailable(zoneEntity) && zoneEntity.state !== "on") return { on: false, rgb: UNLIT, pattern: "solid", speed: 100, count: zone?.ledCount ?? 8 };
  const sourceOn = stateAvailable(zoneEntity) ? true : reported?.on === true || (stateAvailable(global) && global.state === "on");
  if (!sourceOn) return { on: false, rgb: UNLIT, pattern: "solid", speed: 100, count: Number(reported?.leds ?? zone?.ledCount ?? 8) };
  const fallbackColor = normalizedColor(reported?.color) ?? (stateAvailable(global) && global.state === "on" ? normalizedColor(global.attributes.rgb_color) ?? normalizedColor(global.attributes.color) : null);
  const color = stateAvailable(zoneEntity) ? normalizedColor(zoneEntity.attributes.rgb_color) ?? normalizedColor(zoneEntity.attributes.color) ?? fallbackColor : fallbackColor;
  const brightness = (stateAvailable(zoneEntity) ? zoneEntity.attributes.brightness : undefined) ?? reported?.brightness_ha ?? (reported?.brightness_pct != null ? Number(reported.brightness_pct) * 2.55 : undefined) ?? (stateAvailable(global) ? global.attributes.brightness : undefined) ?? 255;
  const pattern = selectedEffect(config, states, stateAvailable(zoneEntity) ? zoneEntity.attributes.effect : undefined, reported?.pattern_name, stateAvailable(global) ? global.attributes.effect : undefined);
  const speed = Number(stateValue(zone?.speedEntity, states) ?? reported?.frame_ms ?? 100);
  return { on: !!color && Number(brightness) > 0, rgb: scaledColor(color, brightness), pattern, speed: Number.isFinite(speed) ? speed : 100, count: Number(reported?.leds ?? stateValue(zone?.countEntity, states) ?? zone?.ledCount ?? 8) };
}
function ledSegments(a: PlanePoint, b: PlanePoint, count: number): [PlanePoint, PlanePoint][] {
  const n = Math.max(1, Math.min(32, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => {
    const lo = i / n + 0.002; const hi = (i + 1) / n - 0.002;
    const at = (t: number): PlanePoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return [at(lo), at(hi)];
  });
}
function bar(a: PlanePoint, b: PlanePoint, width: number, depth: number, z: number, color: string, project: (x: number, y: number, z: number) => [number, number, number]): SmartRgbFace[] {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length * width / 2; const py = dx / length * width / 2;
  const p = [[a[0] + px, a[1] + py], [b[0] + px, b[1] + py], [b[0] - px, b[1] - py], [a[0] - px, a[1] - py]] as [number, number][];
  const faces: SmartRgbFace[] = [];
  const front = p.map(([x, y]) => project(x, y, z + depth / 2)) as [number, number, number][];
  const back = p.map(([x, y]) => project(x, y, z - depth / 2)) as [number, number, number][];
  faces.push({ a: front[0], b: front[1], c: front[2], color }, { a: front[0], b: front[2], c: front[3], color });
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push({ a: front[i], b: back[i], c: back[j], color }, { a: front[i], b: back[j], c: front[j], color }); }
  return faces;
}
function prism(points: PlanePoint[], z: number, depth: number, color: string, project: (x: number, y: number, z: number) => [number, number, number]): SmartRgbFace[] {
  const front = points.map(([x, y]) => project(x, y, z + depth / 2)) as [number, number, number][];
  const back = points.map(([x, y]) => project(x, y, z - depth / 2)) as [number, number, number][];
  const out: SmartRgbFace[] = [];
  for (let i = 1; i < points.length - 1; i++) { out.push({ a: front[0], b: front[i], c: front[i + 1], color }, { a: back[0], b: back[i + 1], c: back[i], color }); }
  for (let i = 0; i < points.length; i++) { const j = (i + 1) % points.length; out.push({ a: front[i], b: back[i], c: back[j], color }, { a: front[i], b: back[j], c: front[j], color }); }
  return out;
}
function ledBar(a: PlanePoint, b: PlanePoint, width: number, depth: number, z: number, rgb: Rgb, pattern: string, phase: number, project: (x: number, y: number, z: number) => [number, number, number], ledCount = 8): SmartRgbFace[] {
  const segments = ledSegments(a, b, pattern.toLowerCase() === "solid" ? 1 : ledCount);
  const out: SmartRgbFace[] = [];
  for (const [i, [from, to]] of segments.entries()) out.push(...bar(from, to, width, depth, z, hex(visualColor(rgb, pattern, (i + 0.5) / segments.length, phase)), project));
  return out;
}

type SmartConfig = NonNullable<ReturnType<typeof readSmartRgbConfig>>;
function fixturePoint(f: Furniture, base: number, x: number, y: number, z: number): [number, number, number] {
  const angle = f.rotation * Math.PI / 180; const mirror = f.mirror ? -1 : 1;
  return [f.x + mirror * x * Math.cos(angle) - z * Math.sin(angle), base + f.h / 2 + y, f.z + mirror * x * Math.sin(angle) + z * Math.cos(angle)];
}
function hexLayout(f: Furniture, cfg: NonNullable<SmartConfig["hex"]>) {
  const raw = hexFrameEdges(cfg.cells, cfg.sideLength); const points = raw.flatMap(edge => [edge.a, edge.b]);
  const minX = Math.min(...points.map(p => p[0])); const maxX = Math.max(...points.map(p => p[0]));
  const minY = Math.min(...points.map(p => p[1])); const maxY = Math.max(...points.map(p => p[1]));
  const margin = cfg.housingWidth * 1.16 + cfg.connectorGap;
  const scale = Math.min(f.w / (maxX - minX + margin || 1), f.h / (maxY - minY + margin || 1));
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  const edges = raw.map(edge => ({ ...edge, a: [(edge.a[0] - cx) * scale, (edge.a[1] - cy) * scale] as PlanePoint, b: [(edge.b[0] - cx) * scale, (edge.b[1] - cy) * scale] as PlanePoint }));
  return { edges, scale, width: cfg.housingWidth * scale, depth: Math.min(f.d, cfg.housingDepth * f.d / 0.12) };
}
function wallLayout(f: Furniture, cfg: NonNullable<SmartConfig["wall"]>) {
  const panels = triangularPanels(cfg.rows, cfg.columns, cfg.panelSide, cfg.grooveDirection);
  const points = panels.flatMap(panel => panel.vertices);
  const minX = Math.min(...points.map(p => p[0])); const maxX = Math.max(...points.map(p => p[0]));
  const minY = Math.min(...points.map(p => p[1])); const maxY = Math.max(...points.map(p => p[1]));
  const margin = Math.max(cfg.panelGap, 0.018);
  const scale = Math.min(f.w / (maxX - minX + margin || 1), f.h / (maxY - minY + margin || 1));
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  const at = (p: PlanePoint): PlanePoint => [(p[0] - cx) * scale, (p[1] - cy) * scale];
  return { edges: trianglePanelEdges(panels), at, scale, stripWidth: Math.min(0.012, Math.max(0.006, cfg.panelGap * scale * 1.4)), stripDepth: Math.min(f.d, 0.01 * f.d / 0.16) };
}

/** Native scene furniture callback; output is triangles consumed by NeonPlan's existing merged geometry buffer. */
export function drawSmartRgb(f: Furniture, base: number, states: Record<string, HassEntity>): SmartRgbFace[] | null {
  const kind = smartRgbType(f.type);
  const config = readSmartRgbConfig(f);
  if (!kind || !config) return null;
  const project = (x: number, y: number, z: number): [number, number, number] => fixturePoint(f, base, x, y, z);
  const out: SmartRgbFace[] = [];
  if (kind === "hex" && config.hex) {
    const cfg = config.hex; const layout = hexLayout(f, cfg);
    if (!layout.edges.length) return out;
    const { edges, scale, width, depth } = layout; const light = hexState(config, states); const pattern = light.on ? light.pattern : "solid";
    for (const [index, edge] of edges.entries()) {
      const gap = cfg.connectorGap * scale / 2; const dx = edge.b[0] - edge.a[0]; const dy = edge.b[1] - edge.a[1]; const len = Math.hypot(dx, dy) || 1;
      const a: PlanePoint = [edge.a[0] + dx * gap / len, edge.a[1] + dy * gap / len]; const b: PlanePoint = [edge.b[0] - dx * gap / len, edge.b[1] - dy * gap / len];
      out.push(...bar(edge.a, edge.b, width + gap, depth, 0, "#24282e", project));
      out.push(...ledBar(a, b, Math.min(cfg.diffuserWidth * scale, width * 0.7), depth * 0.35, depth * 0.52, light.on ? light.rgb : UNLIT, pattern, index / edges.length, project));
    }
    const joints = new Map<string, PlanePoint>(); for (const e of edges) { joints.set(e.a.join(","), e.a); joints.set(e.b.join(","), e.b); }
    for (const [x, y] of joints.values()) out.push(...prism(Array.from({ length: 8 }, (_, i) => [x + (width * 0.58 + cfg.connectorGap * scale / 2) * Math.cos(i * Math.PI / 4), y + (width * 0.58 + cfg.connectorGap * scale / 2) * Math.sin(i * Math.PI / 4)] as PlanePoint), 0, depth * 1.15, "#292d33", project));
    return out;
  }
  if (!config.wall) return out;
  const cfg = config.wall; const layout = wallLayout(f, cfg); const edgeById = new Map(layout.edges.map(edge => [edge.id, edge]));
  for (const [edgeId, zoneId] of Object.entries(cfg.edgeZones)) {
    const edge = edgeById.get(edgeId); const assigned = cfg.zones.find(zone => zone.id === zoneId);
    if (!edge || !assigned) continue;
    const state = wallZoneState(config, zoneId, states);
    const a = layout.at(assigned.reverse ? edge.b : edge.a); const b = layout.at(assigned.reverse ? edge.a : edge.b);
    // Wall pack depth is centered on the mounting plane; the room-facing surface is +d/2.
    const back = f.d / 2; const railZ = back - layout.stripDepth / 2; const ledDepth = layout.stripDepth * 0.35;
    const ledZ = back + ledDepth / 2 + 0.0002;
    out.push(...bar(a, b, layout.stripWidth, layout.stripDepth, railZ, "#24282e", project));
    out.push(...ledBar(a, b, layout.stripWidth * 0.58, ledDepth, ledZ, state.on ? state.rgb : UNLIT, state.on ? state.pattern : "solid", edge.id.length % 7 / 7, project, state.on ? state.count : 1));
  }
  return out;
}

function unit(rgb: Rgb): [number, number, number] { return rgb.map(n => n / 255) as [number, number, number]; }
function makeLine(floorId: string, points: [number, number, number][], rgb: Rgb, pattern: string, speed: number, phase = 0, intensity = 0.75): ScenePiece | null {
  if (!isAnimatedEffect(pattern) || intensity <= 0 || Math.max(...rgb) === 0) return null;
  const [a, b] = points;
  const path = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as [number, number, number]; });
  const flow = Math.max(100, Math.min(2500, Math.round(2600 - speed * 9.8)));
  return { kind: "line", floorId, points: path, colors: path.map((_p, i) => unit(visualColor(rgb, pattern, i / 16, phase))), flow, width: 0.25 };
}
/** Moving light passes use NeonPlan's existing batched cable-flow layer; no Three.js light is created per LED. */
export function smartRgbScene(building: Building, hass: HomeAssistant): ScenePiece[] {
  const result: ScenePiece[] = [];
  for (const floor of building.floors) for (const f of floor.furniture) {
    const kind = smartRgbType(f.type); const config = readSmartRgbConfig(f);
    if (!kind || !config) continue;
    const mount = f.mount_y ?? SMART_RGB_DEFAULT_WALL_MOUNT_Y;
    const world = (x: number, y: number, z: number): [number, number, number] => fixturePoint(f, mount, x, y, z);
    if (kind === "hex" && config.hex) {
      const light = hexState(config, hass.states); if (!light.on) continue;
      const layout = hexLayout(f, config.hex); const pattern = light.pattern;
      if (!isAnimatedEffect(pattern)) continue;
      const depth = layout.depth * 0.35; const ledZ = layout.depth * 0.52 + depth / 2 + 0.0005;
      for (const [i, edge] of layout.edges.entries()) {
        const gap = config.hex.connectorGap * layout.scale / 2; const dx = edge.b[0] - edge.a[0]; const dy = edge.b[1] - edge.a[1]; const len = Math.hypot(dx, dy) || 1;
        const a: PlanePoint = [edge.a[0] + dx * gap / len, edge.a[1] + dy * gap / len]; const b: PlanePoint = [edge.b[0] - dx * gap / len, edge.b[1] - dy * gap / len];
        const [from, to] = ledSegments(a, b, 1)[0];
        const p = (v: PlanePoint) => world(v[0], v[1], ledZ);
        const line = makeLine(floor.id, [p(from), p(to)], light.rgb, pattern, light.speed, i / layout.edges.length, config.glowIntensity);
        if (line) result.push(line);
      }
      continue;
    }
    const cfg = config.wall; if (!cfg) continue;
    const layout = wallLayout(f, cfg); const edgeById = new Map(layout.edges.map(edge => [edge.id, edge]));
    const back = f.d / 2; const ledDepth = layout.stripDepth * 0.35; const ledZ = back + ledDepth + 0.0007;
    for (const [edgeId, id] of Object.entries(cfg.edgeZones)) {
      const edge = edgeById.get(edgeId); const zone = cfg.zones.find(value => value.id === id);
      if (!edge || !zone) continue;
      const light = wallZoneState(config, id, hass.states);
      if (!light.on || !isAnimatedEffect(light.pattern)) continue;
      const segment = ledSegments(layout.at(zone.reverse ? edge.b : edge.a), layout.at(zone.reverse ? edge.a : edge.b), light.count);
      const [from, to] = [segment[0]?.[0], segment.at(-1)?.[1]];
      if (!from || !to) continue;
      const line = makeLine(floor.id, [world(from[0], from[1], ledZ), world(to[0], to[1], ledZ)], light.rgb, light.pattern, light.speed, edge.id.length % 7 / 7, config.glowIntensity);
      if (line) result.push(line);
    }
  }
  return result;
}

export function smartRgbWatched(building: Building): string[] {
  const ids = new Set<string>();
  for (const floor of building.floors) for (const f of floor.furniture) {
    const config = readSmartRgbConfig(f); if (!config) continue;
    Object.values(config.bindings).forEach(id => id && ids.add(id));
    config.wall?.zones.forEach(zone => { if (zone.entity) ids.add(zone.entity); if (zone.speedEntity) ids.add(zone.speedEntity); if (zone.countEntity) ids.add(zone.countEntity); });
  }
  return [...ids];
}

declare global { interface Window { __tpSmartRgbDraw?: typeof drawSmartRgb; __tpSmartRgbStates?: Record<string, HassEntity>; __tpSmartRgbScene?: typeof smartRgbScene; __tpSmartRgbWatched?: typeof smartRgbWatched } }
if (typeof window !== "undefined") { window.__tpSmartRgbDraw = drawSmartRgb; window.__tpSmartRgbStates ??= {}; window.__tpSmartRgbScene = smartRgbScene; window.__tpSmartRgbWatched = smartRgbWatched; }
