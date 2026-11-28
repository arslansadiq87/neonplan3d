import type { Floor, Furniture, Vec2 } from "./model.ts";
import { furnitureFootprint } from "./model.ts";
import type { HassEntity } from "./types.ts";

export const UNDERGROUND_TANK_TYPE = "pack:studio.techpanda.water_tanks:underground_concrete_water_tank";
const PACK_ID = "studio.techpanda.water_tanks";
const isTank = (f: Pick<Furniture, "type">): boolean => f.type === UNDERGROUND_TANK_TYPE;
export const isUndergroundTank = isTank;
const configOf = (f: Furniture): Record<string, unknown> => f.mods?.[PACK_ID] ?? {};
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const numberOf = (state: string): number | null => state.trim() === "" ? null : Number.isFinite(Number(state)) ? Number(state) : null;

/** Render-only room-local floor holes; the saved Floor and Room objects are never modified. */
export function floorCutouts(floor: Floor): Vec2[][] {
  return floor.furniture.filter((f) => isTank(f) && (f.mount_y ?? 0) < 0).map(furnitureFootprint);
}

export interface TankWaterReading {
  fraction: number;
  measuredVolumeL: number | null;
  capacityL: number;
  capacityIsCalibrated: boolean;
  source: "percentage" | "depth" | "volume";
}

function depthMetres(value: number, unit: unknown): number | null {
  switch (String(unit ?? "m").trim().toLowerCase()) {
    case "m": case "meter": case "meters": case "metre": case "metres": return value;
    case "cm": case "centimeter": case "centimeters": case "centimetre": case "centimetres": return value / 100;
    case "mm": case "millimeter": case "millimeters": case "millimetre": case "millimetres": return value / 1000;
    case "ft": case "foot": case "feet": return value * 0.3048;
    case "in": case "inch": case "inches": return value * 0.0254;
    default: return null;
  }
}

function volumeLitres(value: number, unit: unknown): number | null {
  switch (String(unit ?? "l").trim().toLowerCase().replaceAll(" ", "")) {
    case "l": case "liter": case "liters": case "litre": case "litres": return value;
    case "ml": return value / 1000;
    case "m3": case "m³": case "cubicmeter": case "cubicmeters": case "cubicmetre": case "cubicmetres": return value * 1000;
    case "gal": case "usgal": case "gallon": case "gallons": return value * 3.785411784;
    case "ukgal": case "impgal": return value * 4.54609;
    default: return null;
  }
}

/** Strict reading for the underground tank: no unbound, invalid, unknown or unavailable state becomes a fake level. */
export function readTankWater(f: Furniture, states: Record<string, HassEntity>): TankWaterReading | null {
  if (!isTank(f)) return null;
  const config = configOf(f);
  const mode = config.waterMode === "depth" || config.waterMode === "volume" ? config.waterMode : "percent";
  const slot = mode === "depth" ? "depth" : mode === "volume" ? "volume" : "level";
  const entity = f.binds?.[slot];
  const st = entity ? states[entity] : undefined;
  if (!st || /^(unknown|unavailable|none|null)$/i.test(String(st.state ?? ""))) return null;
  const value = numberOf(String(st.state ?? ""));
  if (value === null || value < 0) return null;
  const geometricCapacity = f.w * 0.82 * f.d * 0.82 * f.h * 0.72 * 1000;
  const configuredCapacity = finite(config.maxCapacityL) && config.maxCapacityL > 0 ? config.maxCapacityL : null;
  const capacityL = configuredCapacity ?? geometricCapacity;
  if (!(capacityL > 0)) return null;
  let fraction: number;
  let measuredVolumeL: number | null = null;
  if (mode === "percent") {
    const attr = st.attributes ?? {};
    const pct = finite(attr.current_position) ? attr.current_position : finite(attr.percentage) ? attr.percentage : value;
    // The selected percentage mode is explicit; unitless values are read as percentages too.
    fraction = Math.max(0, Math.min(1, pct / 100));
  } else if (mode === "depth") {
    const unit = st.attributes?.unit_of_measurement ?? config.depthUnit ?? "m";
    const metres = depthMetres(value, unit);
    const usableDepth = finite(config.usableDepthM) && config.usableDepthM > 0 ? config.usableDepthM : f.h * 0.72;
    if (metres === null || !(usableDepth > 0)) return null;
    fraction = Math.max(0, Math.min(1, metres / usableDepth));
  } else {
    const unit = st.attributes?.unit_of_measurement ?? config.volumeUnit ?? "L";
    measuredVolumeL = volumeLitres(value, unit);
    if (measuredVolumeL === null) return null;
    measuredVolumeL = Math.max(0, measuredVolumeL);
    fraction = Math.max(0, Math.min(1, measuredVolumeL / capacityL));
  }
  return { fraction, measuredVolumeL, capacityL, capacityIsCalibrated: configuredCapacity !== null, source: mode === "percent" ? "percentage" : mode };
}

export function measuredIndicator(entity: string | undefined, states: Record<string, HassEntity>): string | null {
  if (!entity) return null;
  const st = states[entity];
  if (!st || /^(unknown|unavailable)$/i.test(st.state)) return "Unavailable";
  return String(st.state);
}
