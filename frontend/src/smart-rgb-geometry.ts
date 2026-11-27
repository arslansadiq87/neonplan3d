/** Pure layout math shared by the smart RGB manager, renderer and tests. */
export type PlanePoint = readonly [number, number];

export interface HexCell {
  q: number;
  r: number;
}

export interface LightEdge {
  id: string;
  a: PlanePoint;
  b: PlanePoint;
  owners: string[];
}

export interface TrianglePanel {
  id: string;
  vertices: [PlanePoint, PlanePoint, PlanePoint];
  raised: boolean;
  grooveAngle: number;
}

/** Insets an equilateral panel evenly from its edges, leaving a consistent seam to adjacent faces. */
export function insetTriangle(vertices: readonly [PlanePoint, PlanePoint, PlanePoint], gap: number): [PlanePoint, PlanePoint, PlanePoint] {
  const side = Math.hypot(vertices[1][0] - vertices[0][0], vertices[1][1] - vertices[0][1]);
  const inradius = side * Math.sqrt(3) / 6;
  const factor = Math.max(0.5, Math.min(1, (inradius - Math.max(0, gap) / 2) / (inradius || 1)));
  const center: PlanePoint = [(vertices[0][0] + vertices[1][0] + vertices[2][0]) / 3, (vertices[0][1] + vertices[1][1] + vertices[2][1]) / 3];
  return vertices.map(([x, y]) => [center[0] + (x - center[0]) * factor, center[1] + (y - center[1]) * factor] as PlanePoint) as [PlanePoint, PlanePoint, PlanePoint];
}

const SQRT3 = Math.sqrt(3);
const fixed = (n: number) => Math.round(n * 10000) / 10000;
const pointKey = ([x, y]: PlanePoint) => `${fixed(x)},${fixed(y)}`;
const edgeKey = (a: PlanePoint, b: PlanePoint) => [pointKey(a), pointKey(b)].sort().join("|");

/** Unique edge table for regular flat-top hexagons in axial coordinates. */
export function hexFrameEdges(cells: readonly HexCell[], side: number): LightEdge[] {
  const edges = new Map<string, LightEdge>();
  for (const cell of cells) {
    const cx = 1.5 * side * cell.q;
    const cy = SQRT3 * side * (cell.r + cell.q / 2);
    const vertices = Array.from({ length: 6 }, (_, i): PlanePoint => {
      const angle = (i * Math.PI) / 3;
      return [fixed(cx + side * Math.cos(angle)), fixed(cy + side * Math.sin(angle))];
    });
    for (let i = 0; i < 6; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % 6];
      const id = edgeKey(a, b);
      const owner = `${cell.q},${cell.r}`;
      const old = edges.get(id);
      if (old) old.owners.push(owner);
      else edges.set(id, { id, a, b, owners: [owner] });
    }
  }
  return [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function hexFrameJoints(edges: readonly LightEdge[]): PlanePoint[] {
  const points = new Map<string, PlanePoint>();
  for (const edge of edges) {
    points.set(pointKey(edge.a), edge.a);
    points.set(pointKey(edge.b), edge.b);
  }
  return [...points.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Two alternating equilateral triangles tile each axial parallelogram. */
export function triangularPanels(rows: number, columns: number, side: number, grooveAngle = 0): TrianglePanel[] {
  const h = side * SQRT3 / 2;
  const lattice = (q: number, r: number): PlanePoint => [q * side + r * side / 2, r * h];
  const panels: TrianglePanel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < columns; q++) {
      const a = lattice(q, r);
      const b = lattice(q + 1, r);
      const c = lattice(q, r + 1);
      const d = lattice(q + 1, r + 1);
      panels.push({ id: `u:${q}:${r}`, vertices: [a, b, c], raised: false, grooveAngle });
      panels.push({ id: `d:${q}:${r}`, vertices: [b, d, c], raised: false, grooveAngle: grooveAngle + 60 });
    }
  }
  return panels;
}

/** Deduplicate panel boundaries and retain the triangles that use each edge. */
export function trianglePanelEdges(panels: readonly TrianglePanel[]): LightEdge[] {
  const edges = new Map<string, LightEdge>();
  const side = panels[0] ? Math.hypot(panels[0].vertices[1][0] - panels[0].vertices[0][0], panels[0].vertices[1][1] - panels[0].vertices[0][1]) : 1;
  const stablePointKey = ([x, y]: PlanePoint) => `${fixed(x / side)},${fixed(y / side)}`;
  for (const panel of panels) for (let i = 0; i < 3; i++) {
    const a = panel.vertices[i];
    const b = panel.vertices[(i + 1) % 3];
    const id = [stablePointKey(a), stablePointKey(b)].sort().join("|");
    const old = edges.get(id);
    if (old) old.owners.push(panel.id);
    else edges.set(id, { id, a, b, owners: [panel.id] });
  }
  return [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Clip parallel groove centre lines to a triangular face. Coordinates and spacing share one unit. */
export function triangleGrooves(vertices: readonly PlanePoint[], angleDegrees: number, spacing: number, margin = 0): [PlanePoint, PlanePoint][] {
  if (vertices.length !== 3 || !Number.isFinite(spacing) || spacing <= 0) return [];
  const a = angleDegrees * Math.PI / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const projections = vertices.map(([x, y]) => x * nx + y * ny);
  const lo = Math.min(...projections) + margin;
  const hi = Math.max(...projections) - margin;
  const grooves: [PlanePoint, PlanePoint][] = [];
  const first = Math.ceil(lo / spacing) * spacing;
  for (let t = first; t <= hi + 1e-7; t += spacing) {
    const intersections: PlanePoint[] = [];
    for (let i = 0; i < 3; i++) {
      const p = vertices[i];
      const q = vertices[(i + 1) % 3];
      const dp = p[0] * nx + p[1] * ny - t;
      const dq = q[0] * nx + q[1] * ny - t;
      if (Math.abs(dp) < 1e-8) intersections.push(p);
      if (dp * dq < 0) {
        const k = dp / (dp - dq);
        intersections.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
      }
    }
    const unique = new Map(intersections.map(p => [pointKey(p), p]));
    const hits = [...unique.values()].sort((p, q) => (p[0] * ux + p[1] * uy) - (q[0] * ux + q[1] * uy));
    if (hits.length >= 2) grooves.push([hits[0], hits[hits.length - 1]]);
  }
  return grooves;
}

/** Bound groove geometry for large custom walls while sampling evenly over each face. */
export function limitedTriangleGrooves(vertices: readonly PlanePoint[], angleDegrees: number, spacing: number, margin = 0, max = 16): [PlanePoint, PlanePoint][] {
  const all = triangleGrooves(vertices, angleDegrees, spacing, margin);
  const n = Math.max(1, Math.floor(max));
  if (all.length <= n) return all;
  if (n === 1) return [all[Math.floor((all.length - 1) / 2)]];
  return Array.from({ length: n }, (_, i) => all[Math.round(i * (all.length - 1) / (n - 1))]);
}

/** Interpolate RGB points across an LED bar; the firmware only reports a zone colour, so this is visual approximation. */
export function gradientSamples(colors: readonly (readonly [number, number, number])[], count: number): [number, number, number][] {
  const n = Math.max(1, Math.floor(count));
  if (!colors.length) return Array.from({ length: n }, () => [0, 0, 0]);
  return Array.from({ length: n }, (_, i) => {
    const p = n === 1 ? 0 : i / (n - 1) * (colors.length - 1);
    const j = Math.floor(p);
    const t = p - j;
    const a = colors[j];
    const b = colors[Math.min(colors.length - 1, j + 1)];
    return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)) as [number, number, number];
  });
}
