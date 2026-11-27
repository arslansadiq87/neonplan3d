import { Box3, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { Furniture } from "../../frontend/src/model.ts";
import { bindValue, liveGroups } from "../../frontend/src/live-parts.ts";
import { packType, setPacks } from "../../frontend/src/packs.ts";
import { pushFurniture, pushPackLive } from "../../frontend/src/viewer/furniture.ts";
import { GeoBuffer, LineBuffer } from "../../frontend/src/viewer/geo.ts";

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
