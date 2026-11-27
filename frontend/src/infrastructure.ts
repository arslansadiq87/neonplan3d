/** Optional downstream infrastructure inventory. It is plain plan data and never configures network hardware. */
export const INFRASTRUCTURE_MODULE_ID = "techpanda.infrastructure";
export const INFRASTRUCTURE_EQUIPMENT = new Set(["dvr", "xvr", "nvr", "analog_bullet_camera", "ip_bullet_camera", "wifi_camera", "dome_camera", "ptz_camera", "router", "access_point", "mesh_node", "switch_8", "poe_switch_8", "fiber_ont", "patch_panel", "rack", "poe_injector"]);
export function infrastructureCategory(type: string): InfrastructureDevice["category"] | null {
  // Furniture pack types are stored as `pack:<pack-id>:<item-id>` in the building.
  // The CCTV equipment pack uses the same item ids as the built-in equipment vocabulary.
  if (type.startsWith("pack:")) type = type.slice(type.lastIndexOf(":") + 1);
  if (["dvr", "xvr", "nvr"].includes(type)) return "recorder";
  if (type === "analog_bullet_camera") return "camera_analog";
  if (["ip_bullet_camera", "wifi_camera", "dome_camera", "ptz_camera"].includes(type)) return "camera_ip";
  if (type === "router") return "router";
  if (["access_point", "mesh_node"].includes(type)) return "access_point";
  if (["switch_8", "poe_switch_8"].includes(type)) return "switch";
  if (type === "fiber_ont") return "ont";
  if (["patch_panel", "rack"].includes(type)) return "rack";
  if (type === "poe_injector") return "injector";
  return null;
}

export type LinkKind = "ethernet" | "poe" | "coax" | "fiber" | "wireless" | "power";
export interface NetworkInterface {
  id: string;
  name: string;
  kind: "ethernet" | "wifi" | "coax" | "fiber" | "power";
  mac?: string;
  hostname?: string;
  assignment?: "static" | "dhcp";
  addresses?: { address: string; prefix: number; network?: string }[];
  gateway?: string;
  dns?: string[];
  vlan?: number;
  upstream?: string;
  upstreamPort?: string;
  managementUrl?: string;
}
export interface InfrastructureDevice {
  id: string;
  furnitureId: string;
  floorId: string;
  category: "recorder" | "camera_analog" | "camera_ip" | "router" | "access_point" | "switch" | "ont" | "rack" | "injector" | "other";
  enabled: boolean;
  name?: string;
  manufacturer?: string;
  model?: string;
  description?: string;
  roomId?: string;
  notes?: string;
  interfaces?: NetworkInterface[];
  bindings?: { availability?: string; camera?: string; motion?: string; status?: string; rssi?: string };
  camera?: { recorderId?: string; channel?: number; signal?: "CVBS" | "AHD" | "TVI" | "CVI"; cableLength?: number; height?: number; azimuth?: number; tilt?: number; hFov?: number; vFov?: number; minRange?: number; maxRange?: number; coverageColor?: string; coverageOpacity?: number; projectGround?: boolean; ptzPan?: number; ptzTilt?: number; ptzZoom?: number };
  recorder?: { type: "DVR" | "XVR" | "NVR"; analogChannels?: number; ipChannels?: number; storageTB?: number };
  router?: { mode?: "router" | "access_point" | "bridge" | "repeater" | "mesh"; dhcp?: boolean; dhcpRange?: string; ssid?: string; bands?: ("2.4GHz" | "5GHz" | "6GHz")[]; channel?: number; channelWidth?: number };
  switch?: { ports?: number; poeBudgetW?: number; poeSensor?: string };
  switchPorts?: { id: string; number: number; name?: string; connectionId?: string; equipmentId?: string; kind?: "ethernet" | "poe"; speedMbps?: number; vlan?: number; poeCapable?: boolean; poeWatts?: number }[];
  wifiCoverage?: { radius: number; directional?: boolean; opacity?: number; color?: string; estimated: true };
}
export interface InfrastructureConnection {
  id: string;
  from: string;
  to: string;
  kind: LinkKind;
  logical: boolean;
  route?: { floorId: string; x: number; z: number; y?: number }[];
  fromPort?: string;
  toPort?: string;
  speedMbps?: number;
  vlan?: number;
  poeWatts?: number;
  estimatedLengthM?: number;
}
export interface InfrastructurePlan { version: 1; devices: InfrastructureDevice[]; connections: InfrastructureConnection[] }

/** Physical cable length in plan coordinates; visual Apart-mode floor separation is never included. */
export function estimateInfrastructureCableLength(building: {floors:{id:string;elevation:number;furniture:{id:string;x:number;z:number;h:number;mount_y?:number|null}[]}[]}, plan: InfrastructurePlan, connection: InfrastructureConnection): number | null {
  const devices=new Map(plan.devices.map(d=>[d.id,d]));
  const a=devices.get(connection.from),b=devices.get(connection.to);if(!a||!b)return null;
  const floors=new Map(building.floors.map(f=>[f.id,f]));
  const furniture=new Map(building.floors.flatMap(f=>f.furniture.map(item=>[item.id,{item,floor:f}] as const)));
  const start=furniture.get(a.furnitureId),end=furniture.get(b.furnitureId);if(!start||!end)return null;
  const points=[{floorId:start.floor.id,x:start.item.x,z:start.item.z,y:(start.item.mount_y??0)+start.item.h/2},...(connection.route??[]),{floorId:end.floor.id,x:end.item.x,z:end.item.z,y:(end.item.mount_y??0)+end.item.h/2}];
  let length=0;
  for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],pf=floors.get(p.floorId),qf=floors.get(q.floorId);if(!pf||!qf)return null;length+=Math.hypot(q.x-p.x,q.z-p.z,(qf.elevation+(q.y??0))-(pf.elevation+(p.y??0)));}
  return Math.round(length*100)/100;
}

/** Build floor-group-relative route segments; Apartment/explode spacing is supplied by the caller at render time. */
export function infrastructureRouteSegments(building:{floors:{id:string;elevation:number;furniture:{id:string;x:number;z:number;h:number;mount_y?:number|null}[]}[]},plan:InfrastructurePlan){
  const furniture=new Map(building.floors.flatMap(f=>f.furniture.map(item=>[item.id,{item,floor:f}] as const))),devices=new Map(plan.devices.map(d=>[d.id,d]));
  return plan.connections.filter(c=>!c.logical).flatMap(c=>{const a=devices.get(c.from),b=devices.get(c.to),fa=a&&building.floors.find(f=>f.id===a.floorId),fb=b&&building.floors.find(f=>f.id===b.floorId),pa=a&&furniture.get(a.furnitureId),pb=b&&furniture.get(b.furnitureId);if(!a||!b||!fa||!fb||!pa||!pb)return[];const points=[{floorId:fa.id,x:pa.item.x,z:pa.item.z,y:(pa.item.mount_y??0)+pa.item.h/2},...(c.route??[]),{floorId:fb.id,x:pb.item.x,z:pb.item.z,y:(pb.item.mount_y??0)+pb.item.h/2}];return points.slice(1).map((q,i)=>({id:c.id,kind:c.kind,a:points[i],b:q}));});
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[\da-f:]+$/i;
const MAC = /^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i;
export function validAddress(address: string): boolean {
  const [ip, prefixText, extra] = address.split("/");
  if (extra !== undefined) return false;
  const prefix = prefixText === undefined ? null : Number(prefixText);
  if (ip.includes(":")) return IPV6.test(ip) && (prefix === null || Number.isInteger(prefix) && prefix >= 0 && prefix <= 128);
  return IPV4.test(ip) && (prefix === null || Number.isInteger(prefix) && prefix >= 0 && prefix <= 32);
}
export function validMac(mac: string): boolean { return MAC.test(mac); }
export function validSubnet(value: string): boolean {
  const [network, prefix, extra] = value.split("/");
  return extra === undefined && !!prefix && IPV4.test(network) && Number.isInteger(Number(prefix)) && Number(prefix) >= 0 && Number(prefix) <= 32;
}

/** Duplicate addresses are warnings only within a shared logical network scope. */
export function duplicateAddressWarnings(devices: InfrastructureDevice[]): string[] {
  const seen = new Map<string, string[]>();
  for (const d of devices) for (const i of d.interfaces ?? []) for (const a of i.addresses ?? []) {
    const key = `${(a.network ?? "default").toLowerCase()}|${a.address.split("/")[0]}`;
    seen.set(key, [...(seen.get(key) ?? []), d.id]);
  }
  return [...seen.entries()].filter(([, ids]) => new Set(ids).size > 1).map(([key, ids]) => `Duplicate ${key.split("|")[1]} in ${key.split("|")[0]}: ${[...new Set(ids)].join(", ")}`);
}

export function validateInfrastructure(data: InfrastructurePlan): string[] {
  const errors: string[] = [];
  const ids = new Set(data.devices.map((d) => d.id));
  if (ids.size !== data.devices.length) errors.push("Device IDs must be unique.");
  for (const d of data.devices) for (const i of d.interfaces ?? []) {
    if (i.mac && !validMac(i.mac)) errors.push(`${d.id}/${i.id}: invalid MAC address.`);
    for (const a of i.addresses ?? []) if (!validAddress(`${a.address}/${a.prefix}`)) errors.push(`${d.id}/${i.id}: invalid IP address or prefix ${a.address}/${a.prefix}.`);
    if (i.gateway && !validAddress(i.gateway)) errors.push(`${d.id}/${i.id}: invalid gateway.`);
    for (const dns of i.dns ?? []) if (!validAddress(dns)) errors.push(`${d.id}/${i.id}: invalid DNS address ${dns}.`);
    if (i.vlan !== undefined && (!Number.isInteger(i.vlan) || i.vlan < 1 || i.vlan > 4094)) errors.push(`${d.id}/${i.id}: VLAN must be 1–4094.`);
  }
  for (const d of data.devices) {
    const ports = d.switchPorts ?? [];
    const assigned = new Map<string, number>();
    const numbers = new Set<number>();
    for (const p of ports) {
      if (numbers.has(p.number)) errors.push(`${d.id}: duplicate switch port ${p.number}.`);
      numbers.add(p.number);
      if (d.switch?.ports !== undefined && (!Number.isInteger(p.number) || p.number < 1 || p.number > d.switch.ports)) errors.push(`${d.id}: port ${p.number} is outside the configured port count.`);
      if (p.vlan !== undefined && (!Number.isInteger(p.vlan) || p.vlan < 1 || p.vlan > 4094)) errors.push(`${d.id}/port ${p.number}: VLAN must be 1–4094.`);
      if (p.speedMbps !== undefined && (!Number.isFinite(p.speedMbps) || p.speedMbps <= 0)) errors.push(`${d.id}/port ${p.number}: link speed must be positive.`);
      if (p.poeWatts !== undefined && (!Number.isFinite(p.poeWatts) || p.poeWatts < 0)) errors.push(`${d.id}/port ${p.number}: PoE draw cannot be negative.`);
      if (p.kind === "poe" && !p.poeCapable) errors.push(`${d.id}/port ${p.number}: PoE link uses a port not marked PoE capable.`);
      if (p.equipmentId) { const prev=assigned.get(p.equipmentId); if (prev !== undefined) errors.push(`${d.id}: equipment ${p.equipmentId} is assigned to ports ${prev} and ${p.number}.`); else assigned.set(p.equipmentId,p.number); }
    }
    if (d.switch?.poeBudgetW !== undefined && ports.reduce((n,p)=>n+(p.poeWatts??0),0)>d.switch.poeBudgetW) errors.push(`${d.id}: configured PoE draw exceeds the switch budget.`);
  }
  const channels = new Map<string,string>();
  for (const d of data.devices) if (d.category.startsWith("camera_") && d.camera?.recorderId && d.camera.channel !== undefined) {
    const key=`${d.camera.recorderId}:${d.category}:${d.camera.channel}`; const existing=channels.get(key);
    if (existing) errors.push(`${d.id}: recorder channel ${d.camera.channel} is already assigned to ${existing}.`); else channels.set(key,d.id);
    const recorder=data.devices.find(x=>x.id===d.camera!.recorderId);
    if (!recorder || recorder.category!=="recorder") errors.push(`${d.id}: assigned recorder is missing or invalid.`);
    const capacity=d.category==="camera_analog"?recorder?.recorder?.analogChannels:recorder?.recorder?.ipChannels;
    if (!Number.isInteger(d.camera.channel) || d.camera.channel<1 || capacity!==undefined && d.camera.channel>capacity) errors.push(`${d.id}: recorder channel is outside configured capacity.`);
  }
  for (const c of data.connections) {
    if (!ids.has(c.from) || !ids.has(c.to)) errors.push(`${c.id}: connection references a missing device.`);
    if (c.from === c.to) errors.push(`${c.id}: a device cannot connect to itself.`);
  }
  return [...errors, ...duplicateAddressWarnings(data.devices)];
}

export function infrastructureValidation(data: InfrastructurePlan): string[] {
  const errors: string[] = [];
  const ids = new Set(data.devices.map(d => d.id));
  for (const d of data.devices) {
    for (const i of d.interfaces ?? []) {
      if (i.mac && !validMac(i.mac)) errors.push(`${d.name || d.id}: invalid MAC ${i.mac}`);
      for (const a of i.addresses ?? []) if (a.address && !validAddress(`${a.address}/${a.prefix}`)) errors.push(`${d.name || d.id}: invalid IP/prefix ${a.address}/${a.prefix}`);
    }
  }
  for (const c of data.connections) if (!ids.has(c.from) || !ids.has(c.to)) errors.push(`${c.id}: missing endpoint`);
  return [...errors, ...duplicateAddressWarnings(data.devices)];
}

export function infrastructureSummary(data: InfrastructurePlan) {
  const devices = data.devices;
  const cameras = devices.filter((d) => d.category === "camera_analog" || d.category === "camera_ip");
  const recorders = devices.filter((d) => d.category === "recorder");
  const switches = devices.filter((d) => d.category === "switch");
  return {
    cameras: cameras.length,
    analogCameras: cameras.filter((d) => d.category === "camera_analog").length,
    ipCameras: cameras.filter((d) => d.category === "camera_ip").length,
    recorders: recorders.length,
    routersAndAccessPoints: devices.filter((d) => d.category === "router" || d.category === "access_point").length,
    switches: switches.length,
    assignedCameras: cameras.filter((d) => d.camera?.recorderId).length,
    usedChannels: cameras.filter((d) => d.camera?.recorderId && d.camera.channel).length,
    switchPorts: switches.reduce((n, d) => n + (d.switch?.ports ?? 0), 0),
    occupiedSwitchPorts: new Set(data.connections.filter((c) => c.fromPort || c.toPort).map((c) => `${c.from}:${c.fromPort ?? ""}|${c.to}:${c.toPort ?? ""}`)).size,
    warnings: validateInfrastructure(data),
  };
}

export function cameraCoverageFootprint(camera: InfrastructureDevice) {
  const c = camera.camera;
  if (!c || camera.category !== "camera_ip" && camera.category !== "camera_analog") return null;
  const horizontal = Math.max(1, Math.min(179, c.hFov ?? 90)) * Math.PI / 180;
  const radius = Math.max(0, Math.min(100, c.maxRange ?? 8));
  return { radius, near: Math.max(0, Math.min(radius, c.minRange ?? 0)), halfAngle: horizontal / 2, azimuth: c.azimuth ?? 0, tilt: Math.max(-90, Math.min(90, c.tilt ?? 20)), height: Math.max(0, c.height ?? 2.4), estimated: true as const };
}

export function furnitureCameraPose(input: { x: number; z: number; rotation: number; floorElevation: number; mountY: number; depth: number; itemHeight: number; furnitureType?: string }, camera: Pick<NonNullable<InfrastructureDevice["camera"]>, "azimuth" | "height" | "tilt" | "hFov" | "vFov" | "maxRange"> | undefined) {
  const azimuth = camera?.azimuth ?? input.rotation;
  const a = azimuth * Math.PI / 180;
  const lensOffset = input.furnitureType?.endsWith(":analog_bullet_camera") || input.furnitureType?.endsWith(":ip_bullet_camera")
    ? input.depth * 0.462
    : Math.max(0.025, Math.min(0.18, input.depth * 0.31));
  return {
    x: input.x - Math.sin(a) * lensOffset,
    z: input.z + Math.cos(a) * lensOffset,
    rotation: azimuth,
    y: Math.max(0, camera?.height ?? input.mountY + input.itemHeight * 0.5),
    worldY: input.floorElevation + Math.max(0, camera?.height ?? input.mountY + input.itemHeight * 0.5),
    fov: Math.max(1, Math.min(179, camera?.hFov ?? 90)),
    vFov: Math.max(1, Math.min(179, camera?.vFov ?? 60)),
    reach: Math.max(0, Math.min(100, camera?.maxRange ?? 8)),
    tilt: Math.max(-90, Math.min(90, camera?.tilt ?? 20)),
  };
}

/** Convert optional infrastructure metadata in the approved module namespace; malformed data is safely ignored. */
export function readInfrastructure(building: { mods?: Record<string, Record<string, unknown>> | null } | null | undefined): InfrastructurePlan {
  const raw = building?.mods?.[INFRASTRUCTURE_MODULE_ID] as Partial<InfrastructurePlan> | undefined;
  if (!raw || raw.version !== 1 || !Array.isArray(raw.devices) || !Array.isArray(raw.connections)) return { version: 1, devices: [], connections: [] };
  const devices = raw.devices.filter((x): x is InfrastructureDevice => !!x && typeof x.id === "string" && typeof x.furnitureId === "string" && typeof x.floorId === "string" && typeof x.category === "string");
  const ids = new Set(devices.map(d => d.id));
  const connections = raw.connections.filter((x): x is InfrastructureConnection => !!x && typeof x.id === "string" && typeof x.from === "string" && typeof x.to === "string" && ids.has(x.from) && ids.has(x.to) && ["ethernet", "poe", "coax", "fiber", "wireless", "power"].includes(x.kind));
  return { version: 1, devices, connections };
}

/** A constrained edit applied by the approved module to its JSON plan namespace. */
export function updateInfrastructureDevice(building: { mods?: Record<string, Record<string, unknown>> | null }, id: string, patch: Partial<InfrastructureDevice>): InfrastructurePlan {
  const plan = readInfrastructure(building);
  const index = plan.devices.findIndex(d => d.furnitureId === id);
  if (index < 0) return plan;
  plan.devices[index] = { ...plan.devices[index], ...patch };
  building.mods ||= {};
  building.mods[INFRASTRUCTURE_MODULE_ID] = plan as unknown as Record<string, unknown>;
  return plan;
}

export function setInfrastructureChannel(plan: InfrastructurePlan, cameraId: string, recorderId: string | null, channel: number | null): boolean {
  const camera = plan.devices.find(d => d.id === cameraId);
  if (!camera || !camera.category.startsWith("camera_")) return false;
  if (recorderId && (!plan.devices.some(d => d.id === recorderId && d.category === "recorder") || !Number.isInteger(channel) || (channel ?? 0) < 1)) return false;
  if (recorderId && plan.devices.some(d => d.id !== cameraId && d.camera?.recorderId === recorderId && d.camera.channel === channel)) return false;
  camera.camera ||= {};
  camera.camera.recorderId = recorderId || undefined;
  camera.camera.channel = recorderId ? channel ?? undefined : undefined;
  return true;
}

export function removeInfrastructureFurniture(plan: InfrastructurePlan, furnitureIds: ReadonlySet<string>): InfrastructurePlan {
  const removed = new Set(plan.devices.filter(d => furnitureIds.has(d.furnitureId)).map(d => d.id));
  return { version: 1, devices: plan.devices.filter(d => !furnitureIds.has(d.furnitureId)), connections: plan.connections.filter(c => !removed.has(c.from) && !removed.has(c.to)).map(c => ({ ...c })) };
}

export function duplicateInfrastructureFurniture(plan: InfrastructurePlan, furnitureIds: ReadonlyMap<string, string>, newId: () => string): InfrastructurePlan {
  const selected = plan.devices.filter(d => furnitureIds.has(d.furnitureId));
  const deviceIds = new Map(selected.map(d => [d.id, newId()]));
  const copies = selected.map(d => ({ ...structuredClone(d), id: deviceIds.get(d.id)!, furnitureId: furnitureIds.get(d.furnitureId)! }));
  const connections = plan.connections.filter(c => deviceIds.has(c.from) && deviceIds.has(c.to)).map(c => ({ ...structuredClone(c), id: newId(), from: deviceIds.get(c.from)!, to: deviceIds.get(c.to)! }));
  return { version: 1, devices: [...plan.devices, ...copies], connections: [...plan.connections.map(c => ({ ...c })), ...connections] };
}
