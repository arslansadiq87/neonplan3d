import type { Building, Furniture } from "./model.ts";
import { readSmartRgbConfig, smartRgbType } from "./smart-rgb-config.ts";
import { hexFrameEdges, insetTriangle, limitedTriangleGrooves, trianglePanelEdges, triangularPanels, type PlanePoint } from "./smart-rgb-geometry.ts";
import type { HassEntity, HomeAssistant } from "./types.ts";
import type { ScenePiece } from "./modules.ts";

export type SmartRgbFace = { a: [number, number, number]; b: [number, number, number]; c: [number, number, number]; color: string };
type Rgb = [number, number, number];
const hex = (rgb: Rgb) => `#${rgb.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
const normalizedColor = (value: unknown): Rgb | null => {
  if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).map(n => Number(n) || 0) as Rgb;
  if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value)) { const s = value.replace("#", ""); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as Rgb; }
  return null;
};
const colorFor = (entity: string | undefined, states: Record<string, HassEntity>): Rgb => {
  const state = entity ? states[entity] : undefined;
  if (!state || state.state !== "on") return [9, 15, 24];
  const color = normalizedColor(state.attributes.rgb_color) ?? normalizedColor(state.attributes.color) ?? [33, 202, 229];
  const level = Math.max(0, Math.min(1, Number(state.attributes.brightness ?? 255) / 255));
  return color.map(channel => Math.round(channel * level)) as Rgb;
};
const rainbow = (t: number): Rgb => { const h = ((t % 1) + 1) % 1 * 6; const x = 255 * (1 - Math.abs(h % 2 - 1)); return h < 1 ? [255, x, 0] : h < 2 ? [x, 255, 0] : h < 3 ? [0, 255, x] : h < 4 ? [0, x, 255] : h < 5 ? [x, 0, 255] : [255, 0, x]; };
const gradientRgb = (base: Rgb, pattern: string, t: number, phase: number): Rgb => pattern.toLowerCase() === "solid" ? base : rainbow(t + phase).map(v => Math.round(v * Math.max(...base) / 255)) as Rgb;
function hexRgb(config: ReturnType<typeof readSmartRgbConfig> & {}, states: Record<string, HassEntity>): Rgb {
  const light = states[config.bindings.light]; const status = states[config.bindings.status]?.attributes ?? {};
  const powered = light?.state === "on" ? true : light?.state === "off" ? false : status.power === true || status.power === "true";
  if (!powered) return [9, 15, 24];
  const rgb = normalizedColor(light?.attributes.rgb_color ?? light?.attributes.color ?? status.color) ?? [33, 202, 229];
  const brightness = Number(light?.attributes.brightness ?? status.brightness_ha ?? status.brightness ?? 255);
  return rgb.map(channel => Math.round(channel * Math.max(0, Math.min(1, brightness / 255)))) as Rgb;
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
  const n = pattern.toLowerCase() === "solid" ? 1 : Math.max(1, Math.min(32, ledCount)); const out: SmartRgbFace[] = [];
  for (let i = 0; i < n; i++) { const lo = i / n + 0.002; const hi = (i + 1) / n - 0.002; if (hi <= lo) continue; const p = (t: number): PlanePoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(...bar(p(lo), p(hi), width, depth, z, hex(gradientRgb(rgb, pattern, (i + 0.5) / n, phase)), project)); }
  return out;
}

/** Native scene furniture callback; output is triangles consumed by NeonPlan's existing merged geometry buffer. */
export function drawSmartRgb(f: Furniture, base: number, states: Record<string, HassEntity>): SmartRgbFace[] | null {
  const kind = smartRgbType(f.type);
  const config = readSmartRgbConfig(f);
  if (!kind || !config) return null;
  // This file is an isolated lazy-loaded bundle, so its copy of packs.ts does not share
  // the main bundle's imported-pack registry. Use the stable pack definition depths here.
  const defaultDepth = kind === "hex" ? 0.12 : 0.16;
  const angle = f.rotation * Math.PI / 180; const mirror = f.mirror ? -1 : 1;
  const project = (x: number, y: number, z: number): [number, number, number] => [f.x + mirror * x * Math.cos(angle) - z * Math.sin(angle), base + f.h / 2 + y, f.z + mirror * x * Math.sin(angle) + z * Math.cos(angle)];
  const out: SmartRgbFace[] = [];
  if (kind === "hex" && config.hex) {
    const cfg = config.hex;
    const raw = hexFrameEdges(cfg.cells, cfg.sideLength);
    if (!raw.length) return out;
    const minX = Math.min(...raw.flatMap(e => [e.a[0], e.b[0]])); const maxX = Math.max(...raw.flatMap(e => [e.a[0], e.b[0]]));
    const minY = Math.min(...raw.flatMap(e => [e.a[1], e.b[1]])); const maxY = Math.max(...raw.flatMap(e => [e.a[1], e.b[1]]));
    const scale = Math.min(f.w / (maxX - minX + cfg.housingWidth * 1.16 + cfg.connectorGap || 1), f.h / (maxY - minY + cfg.housingWidth * 1.16 + cfg.connectorGap || 1));
    const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
    const edges = raw.map(e => ({ ...e, a: [(e.a[0] - centerX) * scale, (e.a[1] - centerY) * scale] as PlanePoint, b: [(e.b[0] - centerX) * scale, (e.b[1] - centerY) * scale] as PlanePoint }));
    const width = cfg.housingWidth * scale; const depth = Math.min(f.d, cfg.housingDepth * f.d / defaultDepth); const rgb = hexRgb(config, states);
    const pattern = states[config.bindings.pattern]?.state ?? String(states[config.bindings.light]?.attributes.effect ?? "rainbow");
    for (const [index, edge] of edges.entries()) {
      const gap = cfg.connectorGap * scale / 2; const dx = edge.b[0] - edge.a[0]; const dy = edge.b[1] - edge.a[1]; const len = Math.hypot(dx, dy) || 1;
      const a: PlanePoint = [edge.a[0] + dx * gap / len, edge.a[1] + dy * gap / len]; const b: PlanePoint = [edge.b[0] - dx * gap / len, edge.b[1] - dy * gap / len];
      out.push(...bar(edge.a, edge.b, width + gap, depth, 0, "#172432", project));
      out.push(...ledBar(a, b, Math.min(cfg.diffuserWidth * scale, width * 0.7), depth * 0.35, depth * 0.52, rgb, pattern, index / edges.length, project));
    }
    const joints = new Map<string, PlanePoint>(); for (const e of edges) { joints.set(e.a.join(","), e.a); joints.set(e.b.join(","), e.b); }
    for (const [x, y] of joints.values()) out.push(...prism(Array.from({ length: 8 }, (_, i) => [x + (width * 0.58 + cfg.connectorGap * scale / 2) * Math.cos(i * Math.PI / 4), y + (width * 0.58 + cfg.connectorGap * scale / 2) * Math.sin(i * Math.PI / 4)] as PlanePoint), 0, depth * 1.15, "#263c50", project));
    return out;
  }
  if (!config.wall) return out;
  const cfg = config.wall; const panels = triangularPanels(cfg.rows, cfg.columns, cfg.panelSide, cfg.grooveDirection);
  const all = panels.flatMap(p => p.vertices);
  const minX = Math.min(...all.map(p => p[0])); const maxX = Math.max(...all.map(p => p[0]));
  const minY = Math.min(...all.map(p => p[1])); const maxY = Math.max(...all.map(p => p[1]));
  const scale = Math.min(f.w / (maxX - minX + Math.max(cfg.panelGap, 0.018) || 1), f.h / (maxY - minY + Math.max(cfg.panelGap, 0.018) || 1));
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  const at = (p: PlanePoint): PlanePoint => [(p[0] - cx) * scale, (p[1] - cy) * scale];
  const edges = trianglePanelEdges(panels);
  const status = states[config.bindings.status]?.attributes ?? {};
  const statusZones = Array.isArray(status.zones) ? status.zones as Record<string, unknown>[] : [];
  const zones = new Map(statusZones.map(zone => [Number(zone.id), zone]));
  const zoneEntities = config.wall.zones;
  const zoneColor = (id: number): { rgb: Rgb; pattern: string } => {
    const zone = zoneEntities.find(z => z.id === id);
    const entity = zone?.entity ? states[zone.entity] : undefined;
    if (entity) return { rgb: entity.state === "on" ? colorFor(zone?.entity, states) : [9, 15, 24], pattern: String(entity.attributes.effect ?? "solid") };
    const value = zones.get(id);
    if (!value || value.on !== true) return { rgb: [9, 15, 24], pattern: "solid" };
    const rgb = normalizedColor(value.color) ?? [37, 198, 219];
    const brightness = Number(value.brightness_ha ?? Number(value.brightness_pct ?? 100) * 2.55) / 255;
    return { rgb: rgb.map(channel => Math.round(channel * Math.max(0, Math.min(1, brightness)))) as Rgb, pattern: String(value.pattern_name ?? "rainbow") };
  };
  for (const panel of panels) {
    const inset = insetTriangle(panel.vertices, cfg.panelGap);
    const vertices = inset.map(at);
    const raised = cfg.raisedPanels.includes(panel.id);
    const depth = Math.min(f.d, (cfg.panelThickness + (raised ? cfg.raisedDepth : 0)) * f.d / defaultDepth);
    const color = raised ? (panel.id.startsWith("u:") ? "#39414a" : "#333a43") : (panel.id.startsWith("u:") ? "#2e343b" : "#252b32");
    out.push(...prism(vertices, -f.d / 2 + depth / 2, depth, color, project));
    const grooves = limitedTriangleGrooves(inset, panel.grooveAngle + 90, cfg.grooveSpacing, cfg.panelGap * 0.75);
    for (const [a, b] of grooves) {
      const x = b[0] - a[0]; const y = b[1] - a[1]; const len = Math.hypot(x, y) || 1; const offset = cfg.grooveDepth * 0.9;
      const ra: PlanePoint = [a[0] - y / len * offset, a[1] + x / len * offset]; const rb: PlanePoint = [b[0] - y / len * offset, b[1] + x / len * offset];
      out.push(...bar(at(a), at(b), Math.max(0.0015, cfg.grooveDepth * scale), depth * 0.18, -f.d / 2 + depth + 0.001, "#12171d", project));
      out.push(...bar(at(ra), at(rb), Math.max(0.001, cfg.grooveDepth * 0.55 * scale), depth * 0.12, -f.d / 2 + depth + 0.003, "#505860", project));
    }
  }
  for (const edge of edges) {
    const zone = cfg.edgeZones[edge.id];
    const a = at(edge.a); const b = at(edge.b); const width = Math.max(cfg.panelGap * scale, (zone === undefined ? 0.006 : 0.018) * scale); const depth = 0.012 * f.d / defaultDepth; const panelDepth = cfg.panelThickness * f.d / defaultDepth; const railZ = -f.d / 2 + panelDepth + depth / 2;
    out.push(...bar(a, b, width, depth, railZ, zone === undefined ? "#30353b" : "#172432", project));
    if (zone !== undefined) { const assigned = cfg.zones.find(z => z.id === zone); const light = zoneColor(zone); const start = assigned?.reverse ? b : a; const end = assigned?.reverse ? a : b; const reportedCount = Number(zones.get(zone)?.leds ?? states[assigned?.countEntity ?? ""]?.state ?? assigned?.ledCount ?? 8); out.push(...ledBar(start, end, width * 0.55, depth * 0.35, railZ + depth * 0.32, light.rgb, light.pattern, edges.indexOf(edge) / Math.max(1, edges.length), project, reportedCount)); }
  }
  return out;
}

function unit(rgb: Rgb): [number, number, number] { return rgb.map(n => n / 255) as [number, number, number]; }
function makeLine(floorId: string, points: [number, number, number][], rgb: Rgb, pattern: string, speed: number, phase = 0, intensity = 0.75): ScenePiece | null {
  if (intensity <= 0 || Math.max(...rgb) === 0) return null;
  const [a, b] = points;
  const path = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as [number, number, number]; });
  const flow = pattern.toLowerCase() === "solid" ? 0 : Math.max(100, Math.min(2500, Math.round(2600 - speed * 9.8)));
  return { kind: "line", floorId, points: path, colors: path.map((_p, i) => unit(gradientRgb(rgb, pattern, i / 16, phase))), flow, width: 0.8 + Math.min(1.2, intensity) };
}
/** Moving light passes use NeonPlan's existing batched cable-flow layer; no Three.js light is created per LED. */
export function smartRgbScene(building: Building, hass: HomeAssistant): ScenePiece[] {
  const result: ScenePiece[] = [];
  for (const floor of building.floors) for (const f of floor.furniture) {
    const kind = smartRgbType(f.type); const config = readSmartRgbConfig(f);
    if (!kind || !config) continue;
    const a = f.rotation * Math.PI / 180; const mirror = f.mirror ? -1 : 1; const mount = f.mount_y ?? 0;
    const world = (x: number, y: number, z: number): [number, number, number] => [f.x + mirror * x * Math.cos(a) - z * Math.sin(a), mount + f.h / 2 + y, f.z + mirror * x * Math.sin(a) + z * Math.cos(a)];
    if (kind === "hex" && config.hex) {
      const light = hass.states[config.bindings.light]; if (!light || light.state !== "on") continue;
      const rgb = hexRgb(config, hass.states); const pattern = hass.states[config.bindings.pattern]?.state ?? String(light.attributes.effect ?? "rainbow");
      const speed = Number(hass.states[config.bindings.speed]?.state ?? 100);
      const edges = hexFrameEdges(config.hex.cells, config.hex.sideLength); const points = edges.flatMap(edge => [edge.a, edge.b]);
      const minX = Math.min(...points.map(p => p[0])); const maxX = Math.max(...points.map(p => p[0])); const minY = Math.min(...points.map(p => p[1])); const maxY = Math.max(...points.map(p => p[1]));
      const scale = Math.min(f.w / (maxX - minX || 1), f.h / (maxY - minY || 1));
      const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
      for (const [i, edge] of edges.entries()) {
        const p = (v: PlanePoint) => world((v[0] - cx) * scale, (v[1] - cy) * scale, f.d * 0.25);
        const line = makeLine(floor.id, [p(edge.a), p(edge.b)], rgb, pattern, speed, i / edges.length, config.glowIntensity);
        if (line) result.push(line);
      }
      continue;
    }
    const cfg = config.wall; if (!cfg) continue;
    const status = hass.states[config.bindings.status]?.attributes ?? {};
    const reported = Array.isArray(status.zones) ? status.zones as Record<string, unknown>[] : [];
    const byId = new Map(reported.map(zone => [Number(zone.id), zone]));
    const panels = triangularPanels(cfg.rows, cfg.columns, cfg.panelSide, cfg.grooveDirection); const vertices = panels.flatMap(panel => panel.vertices);
    const minX = Math.min(...vertices.map(p => p[0])); const maxX = Math.max(...vertices.map(p => p[0])); const minY = Math.min(...vertices.map(p => p[1])); const maxY = Math.max(...vertices.map(p => p[1]));
    const scale = Math.min(f.w / (maxX - minX || 1), f.h / (maxY - minY || 1)); const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
    const at = (v: PlanePoint) => world((v[0] - cx) * scale, (v[1] - cy) * scale, f.d / 2 + 0.012);
    const zoneById = new Map(cfg.zones.map(zone => [zone.id, zone]));
    for (const edge of trianglePanelEdges(panels)) {
      const id = cfg.edgeZones[edge.id]; if (id === undefined) continue;
      const zone = zoneById.get(id); const entity = zone?.entity ? hass.states[zone.entity] : undefined; const reportedZone = byId.get(id);
      const on = entity ? entity.state === "on" : reportedZone?.on === true;
      if (!on) continue;
      const rgb = entity ? colorFor(zone?.entity, hass.states) : normalizedColor(reportedZone?.color) ?? [37, 198, 219];
      const pattern = String(entity?.attributes.effect ?? reportedZone?.pattern_name ?? "rainbow");
      const speed = Number(hass.states[zone?.speedEntity ?? ""]?.state ?? reportedZone?.frame_ms ?? 100);
      const from = zone?.reverse ? edge.b : edge.a; const to = zone?.reverse ? edge.a : edge.b;
      const line = makeLine(floor.id, [at(from), at(to)], rgb, pattern, speed, edge.id.length % 7 / 7, config.glowIntensity);
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
