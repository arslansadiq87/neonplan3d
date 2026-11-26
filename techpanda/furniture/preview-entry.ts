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
const item = pack.items?.[0];
if (!item || !pack.id) throw new Error("Source must contain a NeonPlan furniture pack item");

const [baseW, baseD, baseH] = item.size;
const w = Number(params.get("w") ?? baseW);
const d = Number(params.get("d") ?? baseD);
const h = Number(params.get("h") ?? baseH);
const rotation = Number(params.get("rotation") ?? 0);
const mount = params.get("mount") ?? "0";
const levelParam = params.get("level") ?? "none";
const liveParts = item.parts.filter((part: { bind?: { kind?: string } }) => part.bind?.kind === "level");
const bodyPack = { ...pack, items: pack.items.map((entry: typeof item) => entry.id === item.id ? { ...entry, parts: entry.parts.filter((part: { bind?: { kind?: string } }) => part.bind?.kind !== "level") } : entry) };
const type = packType(pack.id, item.id);
const furniture: Furniture = { id: "preview", type, x: 0, z: 0, rotation, w, d, h, variant: null, entity: null, power: null, mount_y: Number(mount) } as Furniture;

// Static geometry is built by NeonPlan's furniture builder; live water uses the same pack live-part builder as the viewer.
setPacks([bodyPack]);
const body = new GeoBuffer();
const bodyLines = new LineBuffer();
pushFurniture(body, bodyLines, new GeoBuffer(), furniture, Number(mount), true);
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
camera.position.copy(center.clone().add(new Vector3(2.2, 1.45, 3.2).normalize().multiplyScalar(extent * 3.4)));
camera.lookAt(center);
camera.updateProjectionMatrix();
const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(900, 650, false);
renderer.setClearColor(0x101522, 1);
renderer.render(scene, camera);

title.textContent = item.name?.en ?? item.id;
sizeText.textContent = `${w} × ${d} × ${h} m · rotation ${rotation}° · mount ${mount} m · ${levelLabel}`;
image.src = renderer.domElement.toDataURL("image/png");
image.onload = () => { status.textContent = "Rendered with NeonPlan native furniture and live-part geometry."; };
