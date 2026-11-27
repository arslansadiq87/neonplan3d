import type { Furniture } from "./model.ts";
import { hexFrameEdges, trianglePanelEdges, triangularPanels, type HexCell } from "./smart-rgb-geometry.ts";

export const SMART_RGB_PACK_ID = "studio.techpanda.smart_rgb_lighting";
export const SMART_RGB_MODULE_ID = "studio.techpanda.smart_rgb_lighting";
export const HEX_FRAME_ITEM_ID = "hexagonal_rgb_frame_lights";
export const TRIANGLE_WALL_ITEM_ID = "multizone_geometric_rgb_wall_lights";
/** Matches the native pack renderer's default base for wall mounted furniture. */
export const SMART_RGB_DEFAULT_WALL_MOUNT_Y = 1;

export interface SmartRgbZone {
  id: number;
  name: string;
  entity: string;
  ledLength?: number;
  ledCount?: number | null;
  speedEntity?: string;
  countEntity?: string;
  reverse?: boolean;
}

export interface SmartRgbConfig {
  version: 1;
  kind: "hex" | "triangles";
  bindings: Record<string, string>;
  glowIntensity: number;
  hex?: {
    cells: HexCell[];
    sideLength: number;
    housingWidth: number;
    housingDepth: number;
    diffuserWidth: number;
    connectorGap: number;
  };
  wall?: {
    rows: number;
    columns: number;
    panelSide: number;
    panelThickness: number;
    panelGap: number;
    raisedDepth: number;
    grooveSpacing: number;
    grooveDirection: number;
    grooveDepth: number;
    raisedPanels: string[];
    edgeZones: Record<string, number>;
    zones: SmartRgbZone[];
  };
}

const FIRMWARE_ZONES = [
  { id: 0, name: "Wall", entity: "light.rgb_zone_wall", speedEntity: "number.rgb_zone_wall_speed", countEntity: "number.rgb_zone_wall_count" },
  { id: 1, name: "Monitors", entity: "light.rgb_zone_monitors", speedEntity: "number.rgb_zone_monitors_speed", countEntity: "number.rgb_zone_monitors_count" },
  { id: 2, name: "PC Case", entity: "light.rgb_zone_pc_case", speedEntity: "number.rgb_zone_pc_case_speed", countEntity: "number.rgb_zone_pc_case_count" },
  { id: 3, name: "Ceiling", entity: "light.rgb_zone_ceiling", speedEntity: "number.rgb_zone_ceiling_speed", countEntity: "number.rgb_zone_ceiling_count" },
  { id: 4, name: "Moon Globe", entity: "light.rgb_zone_moon_globe", speedEntity: "number.rgb_zone_moon_globe_speed", countEntity: "number.rgb_zone_moon_globe_count" },
];

const DEFAULT_HEX_CELLS: HexCell[] = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }];

function defaultWallZones() {
  const edges = trianglePanelEdges(triangularPanels(4, 4, 0.55));
  const selected = edges.filter((_edge, index) => index % 6 === 2).slice(0, 9).map(edge => edge.id);
  return {
    edgeZones: Object.fromEntries(selected.map(id => [id, 0])),
    zones: FIRMWARE_ZONES.map(zone => ({ ...zone, reverse: false })),
  };
}

export function smartRgbType(type: string): "hex" | "triangles" | null {
  const prefix = `pack:${SMART_RGB_PACK_ID}:`;
  if (!type.startsWith(prefix)) return null;
  const id = type.slice(prefix.length);
  return id === HEX_FRAME_ITEM_ID ? "hex" : id === TRIANGLE_WALL_ITEM_ID ? "triangles" : null;
}

export function defaultSmartRgbConfig(kind: "hex" | "triangles"): SmartRgbConfig {
  if (kind === "hex") return {
    version: 1,
    kind,
    glowIntensity: 0.75,
    bindings: {
      light: "light.hex_led",
      status: "sensor.hex_led_status_raw",
      pattern: "input_select.hex_led_pattern",
      speed: "input_number.hex_led_speed",
      color: "input_text.hex_led_color",
    },
    hex: { cells: DEFAULT_HEX_CELLS.map(cell => ({ ...cell })), sideLength: 0.42, housingWidth: 0.055, housingDepth: 0.035, diffuserWidth: 0.018, connectorGap: 0.012 },
  };
  const wall = defaultWallZones();
  return {
    version: 1,
    kind,
    glowIntensity: 0.75,
    bindings: { light: "light.rgb_lights", pattern: "select.rgb_pattern", status: "sensor.rgb_controller_status" },
    wall: { rows: 4, columns: 4, panelSide: 0.55, panelThickness: 0.035, panelGap: 0.008, raisedDepth: 0.024, grooveSpacing: 0.035, grooveDirection: 0, grooveDepth: 0.002, raisedPanels: ["u:1:1", "d:2:2", "u:3:1", "d:0:2"], ...wall },
  };
}

export function readSmartRgbConfig(item: Pick<Furniture, "mods" | "type">): SmartRgbConfig | null {
  const kind = smartRgbType(item.type);
  if (!kind) return null;
  const stored = item.mods?.[SMART_RGB_MODULE_ID] as unknown as SmartRgbConfig | undefined;
  const base = defaultSmartRgbConfig(kind);
  if (!stored || stored.version !== 1 || stored.kind !== kind) return base;
  if (kind === "hex") return sanitizeSmartRgbConfig({ ...base, ...stored, bindings: { ...base.bindings, ...stored.bindings }, hex: { ...base.hex!, ...stored.hex, cells: stored.hex?.cells?.length ? stored.hex.cells : base.hex!.cells } });
  const edgeZones = stored.wall && Object.prototype.hasOwnProperty.call(stored.wall, "edgeZones")
    ? stored.wall.edgeZones ?? {}
    : base.wall!.edgeZones;
  return sanitizeSmartRgbConfig({ ...base, ...stored, bindings: { ...base.bindings, ...stored.bindings }, wall: { ...base.wall!, ...stored.wall, zones: stored.wall?.zones?.length ? stored.wall.zones : base.wall!.zones, edgeZones } });
}

export function writeSmartRgbConfig(item: Furniture, config: SmartRgbConfig): void {
  item.mods ??= {};
  item.mods[SMART_RGB_MODULE_ID] = config as unknown as Record<string, unknown>;
}

/** Remove malformed map entries on import without changing valid saved layout settings. */
export function sanitizeSmartRgbConfig(config: SmartRgbConfig): SmartRgbConfig {
  if (config.kind === "hex") {
    const base = defaultSmartRgbConfig("hex").hex!;
    const source = config.hex ?? base;
    const cells = (source.cells ?? []).filter(cell => Number.isInteger(cell.q) && Number.isInteger(cell.r) && Math.abs(cell.q) <= 32 && Math.abs(cell.r) <= 32).slice(0, 48);
    const clamp = (n: number, lo: number, hi: number, fallback: number) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
    return { ...config, glowIntensity: clamp(config.glowIntensity, 0, 1.5, 0.75), bindings: Object.fromEntries(Object.entries(config.bindings ?? {}).filter(([k, v]) => typeof k === "string" && typeof v === "string")), hex: { ...base, ...source, sideLength: clamp(source.sideLength, 0.08, 1.2, base.sideLength), housingWidth: clamp(source.housingWidth, 0.01, 0.18, base.housingWidth), housingDepth: clamp(source.housingDepth, 0.01, 0.12, base.housingDepth), diffuserWidth: clamp(source.diffuserWidth, 0.005, 0.06, base.diffuserWidth), connectorGap: clamp(source.connectorGap, 0, 0.08, base.connectorGap), cells: cells.length ? cells : DEFAULT_HEX_CELLS.map(cell => ({ ...cell })) } };
  }
  const base = defaultSmartRgbConfig("triangles").wall!;
  const wall = config.wall ?? base;
  const rows = Number.isFinite(wall.rows) ? Math.max(1, Math.min(16, Math.round(wall.rows))) : base.rows;
  const columns = Number.isFinite(wall.columns) ? Math.max(1, Math.min(16, Math.round(wall.columns))) : base.columns;
  const validIds = new Set(trianglePanelEdges(triangularPanels(rows, columns, 1)).map(edge => edge.id));
  const zones = (wall.zones ?? base.zones).filter((zone, index, all) => Number.isInteger(zone.id) && zone.id >= 0 && zone.id < FIRMWARE_ZONES.length && all.findIndex(other => other.id === zone.id) === index).map(zone => ({ ...zone, name: String(zone.name || `Zone ${zone.id}`), entity: String(zone.entity || ""), speedEntity: String(zone.speedEntity || ""), countEntity: String(zone.countEntity || ""), ledLength: Number.isFinite(zone.ledLength) ? Math.max(0.1, Math.min(30, zone.ledLength!)) : undefined, ledCount: Number.isInteger(zone.ledCount) ? Math.max(1, Math.min(600, zone.ledCount!)) : null }));
  const zoneIds = new Set(zones.map(zone => zone.id));
  const edgeZones = Object.fromEntries(Object.entries(wall.edgeZones ?? {}).filter(([id, zone]) => validIds.has(id) && Number.isInteger(zone) && zoneIds.has(zone)));
  const raisedPanels = (wall.raisedPanels ?? []).filter(id => { const match = /^([ud]):(\d+):(\d+)$/.exec(id); return !!match && Number(match[2]) < columns && Number(match[3]) < rows; });
  const clamp = (n: number, lo: number, hi: number, fallback: number) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  const cleanWall = { ...base, ...wall, rows, columns, zones: zones.length ? zones : base.zones.map(zone => ({ ...zone })), panelSide: clamp(wall.panelSide, 0.15, 1.5, base.panelSide), panelThickness: clamp(wall.panelThickness, 0.005, 0.1, base.panelThickness), panelGap: clamp(wall.panelGap, 0, 0.04, base.panelGap), raisedDepth: clamp(wall.raisedDepth, 0.002, 0.08, base.raisedDepth), grooveSpacing: clamp(wall.grooveSpacing, 0.008, 0.12, base.grooveSpacing), grooveDirection: clamp(wall.grooveDirection, 0, 180, base.grooveDirection), grooveDepth: clamp(wall.grooveDepth, 0.0005, 0.01, base.grooveDepth), edgeZones, raisedPanels };
  return { ...config, glowIntensity: clamp(config.glowIntensity, 0, 1.5, 0.75), bindings: Object.fromEntries(Object.entries(config.bindings ?? {}).filter(([k, v]) => typeof k === "string" && typeof v === "string")), wall: cleanWall };
}

export function defaultZoneChoices(): readonly Readonly<SmartRgbZone>[] {
  return FIRMWARE_ZONES;
}

export function hexEdgesForConfig(config: SmartRgbConfig) {
  const x = config.hex;
  return x ? hexFrameEdges(x.cells, x.sideLength) : [];
}
