// The property (Grundstück): the main plan with the plans standing beside it (the garage, the garden house) as one
// building for the 3D view – each moved and turned to its place, its ids prefixed with its plan so nothing collides.
// Floors at the same height are drawn as one (the garden house's ground floor beside the house's). Read only: a tap
// on a room maps back to its plan and room.
import type { PlanSite } from "./api.ts";
import { outdoorGround, type Building, type Floor, type RoofSection, type SolarField, type SolarString, type Vec2 } from "./model.ts";
import { roofSectionsFromRooms, turnSectionAbout } from "./roof-sections.ts";
import { groundFloor, wallFaces } from "./solar.ts";

/** The separator between a plan's id and the id of one of its pieces in the property view. */
export const SITE_SEP = ":";

/** How far apart (m) two floors may be in height and still be drawn as one. */
const SAME_LEVEL = 0.05;

export interface SitePlan {
  id: string;
  building: Building;
  site: PlanSite | null;
}

/** A piece of the property view back to its plan: "pgarten:werk" → { plan: "pgarten", id: "werk" }; unprefixed: the main plan. */
export function siteOwner(id: string, main: string): { plan: string; id: string } {
  const i = id.indexOf(SITE_SEP);
  return i > 0 ? { plan: id.slice(0, i), id: id.slice(i + 1) } : { plan: main, id };
}

/** A point turned by `rot` degrees (clockwise in the plan, as the editor's "turn 90°") and moved by (x, y). */
export function placePoint(p: Vec2, site: PlanSite): Vec2 {
  const a = (site.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [r(p[0] * c - p[1] * s + site.x), r(p[0] * s + p[1] * c + site.y)];
}

/** One plan's floor moved to its place on the property, its ids prefixed. */
export function placeFloor(f: Floor, plan: string, site: PlanSite): Floor {
  const id = (x: string) => `${plan}${SITE_SEP}${x}`;
  const mv = (p: Vec2) => placePoint(p, site);
  const turn = (deg: number | null | undefined) => (((deg ?? 0) + site.rot) % 360 + 360) % 360;
  return {
    ...f,
    id: id(f.id),
    rooms: f.rooms.map((r) => ({ ...r, id: id(r.id), points: r.points.map(mv), start_view: null })),
    openings: f.openings.map((o) => ({ ...o, id: id(o.id), room_id: id(o.room_id), wall: o.wall ? id(o.wall) : o.wall })),
    furniture: f.furniture.map((m) => {
      const [x, z] = mv([m.x, m.z]);
      return { ...m, id: id(m.id), x, z, rotation: turn(m.rotation) };
    }),
    placements: f.placements.map((p) => {
      const [x, z] = mv([p.x, p.z]);
      return { ...p, x, z, rotation: turn(p.rotation) };
    }),
    outdoor: (f.outdoor ?? []).map((a) => ({ ...a, id: id(a.id), points: a.points.map(mv) })),
    walls: (f.walls ?? []).map((w) => ({ ...w, id: id(w.id), a: mv(w.a), b: mv(w.b) })),
    background: null,
    start_view: null,
  };
}

/** A building's roof as sections (an automatic roof is turned into the sections it is made of; none: no roof). */
export function roofSectionsOf(b: Building, prefix = ""): RoofSection[] {
  const roof = b.settings.roof;
  if (!roof || roof.type === "none") return [];
  if (roof.type === undefined || roof.type === "custom") return roof.sections ?? [];
  const made = roofSectionsFromRooms(b, (i) => `${prefix}roof_${i + 1}`);
  return roof.type === "flat" ? made.map((x) => ({ ...x, shape: "flat" as const })) : made;
}

/** A roof section of another plan moved and turned with its building, its id prefixed. */
export function placeSection(sec: RoofSection, plan: string, site: PlanSite): RoofSection {
  const turned = site.rot ? turnSectionAbout(sec, site.rot, [0, 0]) : sec;
  const mv = (p: Vec2): Vec2 => [p[0] + site.x, p[1] + site.y];
  return {
    ...turned,
    id: `${plan}${SITE_SEP}${sec.id}`,
    x0: turned.x0 + site.x,
    x1: turned.x1 + site.x,
    z0: turned.z0 + site.y,
    z1: turned.z1 + site.y,
    pivot: turned.pivot ? mv(turned.pivot) : turned.pivot,
    points: turned.points ? turned.points.map(mv) : turned.points,
  };
}

/** A solar field's references and placement after its plan is moved into the property. */
function placeSolarField(
  field: SolarField,
  plan: SitePlan,
  sourceSections: readonly RoofSection[],
  placedSections: readonly RoofSection[],
  target: Building,
): SolarField {
  const { id, building, site } = plan;
  const roof = building.settings.roof;
  let face = field.face;
  let u = field.u;
  let v = field.v;
  let rotation = field.rotation;
  let base = field.base;
  let siteFloorId: string | undefined;
  if (face === "ground") {
    const sourceFloor = groundFloor(building);
    const targetFloor = groundFloor(target);
    siteFloorId = sourceFloor ? target.floors.find((floor) => Math.abs(floor.elevation - sourceFloor.elevation) < SAME_LEVEL)?.id : undefined;
    const sourceGround = field.base ?? (sourceFloor ? outdoorGround(sourceFloor, u, v) : 0);
    [u, v] = placePoint([u, v], site!);
    rotation = (((rotation ?? 0) + site!.rot) % 360 + 360) % 360;
    base = sourceGround + (sourceFloor?.elevation ?? 0) - (targetFloor?.elevation ?? 0);
  } else if (face.startsWith("wall:")) {
    const sourceFace = wallFaces(building).find((candidate) => candidate.key === face);
    if (sourceFace?.wall) {
      const floorId = `${id}${SITE_SEP}${sourceFace.wall.floorId}`;
      const [x, z] = placePoint([sourceFace.o[0], sourceFace.o[2]], site!);
      const angle = (site!.rot * Math.PI) / 180;
      const eu: Vec2 = [sourceFace.eu[0] * Math.cos(angle) - sourceFace.eu[2] * Math.sin(angle), sourceFace.eu[0] * Math.sin(angle) + sourceFace.eu[2] * Math.cos(angle)];
      const placedFace = wallFaces(target, floorId).find(
        (candidate) =>
          candidate.wall?.floorId === floorId &&
          Math.hypot(candidate.o[0] - x, candidate.o[2] - z) < 0.01 &&
          Math.hypot(candidate.eu[0] - eu[0], candidate.eu[2] - eu[1]) < 0.001 &&
          Math.abs(candidate.lu - sourceFace.lu) < 0.01,
      );
      if (placedFace) face = placedFace.key;
    }
  } else {
    const single = roof.type !== "custom" && roof.type !== undefined;
    if (single && sourceSections[0] && placedSections[0] && face.startsWith("main:")) {
      face = `${placedSections[0].id}:${face.slice(5)}`;
    } else {
      face = `${id}${SITE_SEP}${face}`;
    }
  }
  return {
    ...field,
    id: `${id}${SITE_SEP}${field.id}`,
    face,
    u,
    v,
    ...(rotation === undefined ? {} : { rotation }),
    ...(base === undefined ? {} : { base }),
    ...(face === "ground" && siteFloorId ? { siteFloorId } : {}),
    ...(field.string ? { string: `${id}${SITE_SEP}${field.string}` } : {}),
  };
}

function placeSolarString(string: SolarString, plan: string): SolarString {
  return {
    ...string,
    id: `${plan}${SITE_SEP}${string.id}`,
    ...(string.inverter ? { inverter: `${plan}${SITE_SEP}${string.inverter}` } : {}),
  };
}

/**
 * The property as one building: the main plan as it is, every plan standing on it (`site.on`) placed beside it.
 * A floor of another plan joins the main plan's floor at its height, else it is a floor of its own.
 */
export function composeSite(main: Building, others: readonly SitePlan[]): Building {
  const floors: Floor[] = main.floors.map((f) => ({ ...f, rooms: [...f.rooms], openings: [...f.openings], furniture: [...f.furniture], placements: [...f.placements], outdoor: [...(f.outdoor ?? [])], walls: [...(f.walls ?? [])] }));
  for (const p of others) {
    if (!p.site?.on) continue;
    for (const f of p.building.floors) {
      const placed = placeFloor(f, p.id, p.site);
      const same = floors.find((x) => Math.abs(x.elevation - f.elevation) < SAME_LEVEL);
      if (!same) {
        floors.push(placed);
        continue;
      }
      same.rooms.push(...placed.rooms);
      same.openings.push(...placed.openings);
      same.furniture.push(...placed.furniture);
      same.placements.push(...placed.placements);
      same.outdoor.push(...placed.outdoor);
      same.walls = [...(same.walls ?? []), ...(placed.walls ?? [])];
    }
  }
  floors.sort((a, b) => a.elevation - b.elevation);
  // every building keeps its own roof: all of them become sections of one roof (an automatic roof would span the
  // whole property). The main roof's solar fields on its single roof move to its first section.
  // a building without a single room has no roof on the property: sections left over from deleted rooms would stand
  // in the air beside the other buildings (#986)
  const hasRooms = (b: Building) => b.floors.some((f) => f.rooms.some((r) => r.points.length >= 3));
  const own = hasRooms(main) ? roofSectionsOf(main) : [];
  const single = main.settings.roof.type !== "custom" && main.settings.roof.type !== undefined;
  const mainSolar = (main.settings.roof.solar ?? []).map((f) => (single && own[0] && f.face.startsWith("main:") ? { ...f, face: `${own[0].id}:${f.face.slice(5)}` } : f));
  const propertyPlans = others.filter((p) => p.site?.on && hasRooms(p.building));
  const sectionsByPlan = propertyPlans.map((p) => ({
    plan: p,
    source: roofSectionsOf(p.building),
    placed: roofSectionsOf(p.building).map((x) => placeSection(x, p.id, p.site!)),
  }));
  const sections = [...own, ...sectionsByPlan.flatMap((x) => x.placed)];
  const targetWalls = { ...main, floors };
  const solar = [
    ...mainSolar,
    ...sectionsByPlan.flatMap(({ plan, source, placed }) =>
      (plan.building.settings.roof.solar ?? []).map((field) => placeSolarField(field, plan, source, placed, targetWalls)),
    ),
  ];
  const strings = [
    ...(main.settings.roof.strings ?? []),
    ...propertyPlans.flatMap((p) => (p.building.settings.roof.strings ?? []).map((string) => placeSolarString(string, p.id))),
  ];
  const roof = { ...main.settings.roof, type: "custom" as const, sections, solar, strings };
  // the property has no house start view (it would frame the main house only) and no card templates of its own
  return { ...main, floors, card_templates: [], settings: { ...main.settings, start_view: null, roof } };
}
