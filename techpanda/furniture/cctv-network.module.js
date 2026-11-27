// Optional infrastructure inventory interface. Install only after review through NeonPlan's approved module flow.
// This module contains no credentials, performs no scans and never changes real device settings.
const ID = "techpanda.infrastructure";
const CAMERA_TYPES = new Set(["analog_bullet_camera", "ip_bullet_camera", "wifi_camera", "dome_camera", "ptz_camera"]);
const RECORDER_TYPES = new Set(["dvr", "xvr", "nvr"]);
const NETWORK_TYPES = new Set(["router", "access_point", "mesh_node", "switch_8", "poe_switch_8", "fiber_ont", "patch_panel", "rack", "poe_injector"]);
const CATEGORIES = { dvr: "recorder", xvr: "recorder", nvr: "recorder", analog_bullet_camera: "camera_analog", ip_bullet_camera: "camera_ip", wifi_camera: "camera_ip", dome_camera: "camera_ip", ptz_camera: "camera_ip", router: "router", access_point: "access_point", mesh_node: "access_point", switch_8: "switch", poe_switch_8: "switch", fiber_ont: "ont", patch_panel: "rack", rack: "rack", poe_injector: "injector" };
const blank = () => ({ version: 1, devices: [], connections: [] });
function data(building) { return building?.mods?.[ID] || blank(); }
function inputs(host, device, d) {
  const b = host.building();
  const set = (path, value) => {
    let obj = device;
    for (const key of path.slice(0, -1)) obj = obj[key] ||= {};
    obj[path[path.length - 1]] = value;
    host.updateBuilding(n => { n.mods ||= {}; n.mods[ID] = d; });
  };
  const text = (label, path, value, placeholder = "") => ({ kind: "input", label, value: value || "", placeholder, set: v => set(path, v || undefined) });
  const num = (label, path, value, min = 0, max = 100) => ({ kind: "number", label, value: Number.isFinite(value) ? value : null, min, max, set: v => set(path, v == null ? undefined : Math.max(min, Math.min(max, v))) });
  const entity = (label, key, value, domain) => ({ kind: "entity", label, value: value || null, filter: id => id.startsWith(`${domain}.`), set: v => { device.bindings ||= {}; device.bindings[key] = v || undefined; host.updateBuilding(n => { n.mods ||= {}; n.mods[ID] = d; }); } });
  const fields = [text("Device name", ["name"], device.name), text("Manufacturer", ["manufacturer"], device.manufacturer), text("Model", ["model"], device.model)];
  if (device.category === "recorder" || device.category === "camera_ip" || device.category === "router" || device.category === "switch" || device.category === "access_point" || device.category === "ont") {
    const iface = device.interfaces?.[0] || (device.interfaces = [{ id: host.newId("if"), name: "LAN", kind: "ethernet", assignment: "static", addresses: [] }])[0];
    fields.push(text("IPv4 address", ["interfaces", 0, "addresses", 0, "address"], iface.addresses?.[0]?.address, "192.168.1.20"));
    fields.push(num("IPv4 prefix length", ["interfaces", 0, "addresses", 0, "prefix"], iface.addresses?.[0]?.prefix ?? 24, 0, 32));
    fields.push(text("Logical network", ["interfaces", 0, "addresses", 0, "network"], iface.addresses?.[0]?.network, "home-lan"));
    fields.push(text("MAC address", ["interfaces", 0, "mac"], iface.mac, "AA:BB:CC:DD:EE:FF"));
    fields.push(text("Default gateway", ["interfaces", 0, "gateway"], iface.gateway, "192.168.1.1"));
  }
  if (device.category === "recorder") {
    device.recorder ||= { type: device.furnitureId.includes("xvr") ? "XVR" : "NVR", analogChannels: 8, ipChannels: 8 };
    fields.push({ kind: "heading", text: "Recorder channels" });
    fields.push(num("Analog channel count", ["recorder", "analogChannels"], device.recorder.analogChannels ?? 0, 0, 64));
    fields.push(num("IP channel count", ["recorder", "ipChannels"], device.recorder.ipChannels ?? 0, 0, 128));
    const cams = d.devices.filter(x => x.category.startsWith("camera_"));
    const assigned = cams.filter(x => x.camera?.recorderId === device.id);
    fields.push({ kind: "text", text: `Assigned channels: ${assigned.length}; available analog/IP capacity is shown by the configured limits. Channel numbers are unique per recorder.` });
    for (const cam of cams) fields.push({ kind: "select", label: `${cam.name || cam.id} channel`, value: cam.camera?.recorderId === device.id && cam.camera?.channel ? String(cam.camera.channel) : "", options: [{id:"",label:"Unassigned"}, ...Array.from({length:(cam.category === "camera_analog" ? device.recorder.analogChannels : device.recorder.ipChannels) || 0},(_,i)=>({id:String(i+1),label:`Channel ${i+1}${assigned.some(x=>x!==cam && x.camera?.channel===i+1)?" (occupied)":""}`}))], set: v => { if (v && assigned.some(x=>x!==cam && x.camera?.channel===Number(v))) return; cam.camera ||= {}; cam.camera.recorderId = v ? device.id : undefined; cam.camera.channel = v ? Number(v) : undefined; host.updateBuilding(n => { n.mods ||= {}; n.mods[ID] = d; }); } });
  }
  if (device.category.startsWith("camera_")) {
    device.camera ||= {};
    fields.push({ kind: "heading", text: "Camera coverage (estimated geometry)" });
    fields.push(num("Mounting height (m)", ["camera", "height"], device.camera.height ?? 2.4, 0, 10));
    fields.push(num("Azimuth (degrees)", ["camera", "azimuth"], device.camera.azimuth ?? 0, 0, 359));
    fields.push(num("Downward tilt (degrees)", ["camera", "tilt"], device.camera.tilt ?? 20, -90, 90));
    fields.push(num("Horizontal field of view (degrees)", ["camera", "hFov"], device.camera.hFov ?? 90, 10, 180));
    fields.push(num("Vertical field of view (degrees)", ["camera", "vFov"], device.camera.vFov ?? 55, 5, 120));
    fields.push(num("Maximum visualization distance (m)", ["camera", "maxRange"], device.camera.maxRange ?? 8, 0, 100));
    if (device.category === "camera_analog") fields.push({ kind: "select", label: "Coax signal", value: device.camera.signal || "AHD", options: ["CVBS","AHD","TVI","CVI"].map(x=>({id:x,label:x})), set: v => set(["camera","signal"],v) });
    fields.push(entity("Home Assistant camera entity", "camera", device.bindings?.camera, "camera"));
    fields.push(entity("Motion entity", "motion", device.bindings?.motion, "binary_sensor"));
    fields.push(entity("Availability entity", "availability", device.bindings?.availability, "binary_sensor"));
  }
  if (device.category === "router" || device.category === "access_point") {
    device.router ||= {};
    fields.push({ kind: "select", label: "Operating mode", value: device.router.mode || "router", options: ["router","access_point","bridge","repeater","mesh"].map(x=>({id:x,label:x.replaceAll("_"," ")})), set: v => set(["router","mode"],v) });
    fields.push({ kind: "check", label: "DHCP enabled", value: !!device.router.dhcp, set: v => set(["router","dhcp"],v) });
    fields.push(text("DHCP range (documentation)", ["router","dhcpRange"], device.router.dhcpRange, "192.168.1.100-192.168.1.200"));
    fields.push(text("SSID (no password)", ["router","ssid"], device.router.ssid));
    fields.push(num("Estimated Wi-Fi radius (m)", ["wifiCoverage","radius"], device.wifiCoverage?.radius ?? 8, 0, 100));
    fields.push(num("Coverage opacity (%)", ["wifiCoverage","opacity"], Math.round((device.wifiCoverage?.opacity ?? 0.15)*100), 0, 60));
    fields.push(entity("Wi-Fi RSSI entity", "rssi", device.bindings?.rssi, "sensor"));
  }
  if (device.category === "switch") {
    device.switch ||= {};
    fields.push({ kind: "select", label: "Port count", value: String(device.switch.ports || 8), options: [4,5,8,16,24,48].map(x=>({id:String(x),label:`${x} ports`})), set: v => set(["switch","ports"],Number(v)) });
    fields.push(num("Total PoE budget (W)", ["switch","poeBudgetW"], device.switch.poeBudgetW ?? 0, 0, 5000));
    fields.push(entity("PoE consumption sensor", "poeSensor", device.switch.poeSensor, "sensor"));
  }
  fields.push(entity("Availability entity", "availability", device.bindings?.availability, "binary_sensor"));
  return fields;
}
function summary(d) {
  const cams = d.devices.filter(x => x.category.startsWith("camera_"));
  return [`${cams.length} cameras (${cams.filter(x => x.category === "camera_analog").length} analog, ${cams.filter(x => x.category === "camera_ip").length} IP)`, `${d.devices.filter(x => x.category === "recorder").length} recorders`, `${d.devices.filter(x => ["router", "access_point"].includes(x.category)).length} routers/access points`, `${d.devices.filter(x => x.category === "switch").length} switches`, `${d.connections.length} connections`];
}
export default {
  api: 1,
  id: ID,
  furnitureFields(host, item) {
    if (!CAMERA_TYPES.has(item.type) && !RECORDER_TYPES.has(item.type) && !NETWORK_TYPES.has(item.type)) return [];
    const b = host.building();
    if (!b) return [];
    const d = data(b);
    let device = d.devices.find(x => x.furnitureId === item.id);
    const ensure = () => {
      if (!device) {
        device = { id: host.newId("infra"), furnitureId: item.id, floorId: b.floors.find(f => f.furniture.some(x => x.id === item.id))?.id || "", category: CATEGORIES[item.type] || "other", enabled: true, interfaces: [], bindings: {} };
        d.devices.push(device);
      }
      return device;
    };
    const fields = [{ kind: "heading", text: "Infrastructure" }];
    if (!device) return [...fields, { kind: "text", text: "This item is not registered. Edit the options below to add it to the inventory." }, { kind: "button", label: "Add to infrastructure inventory", primary: true, onTap: () => { ensure(); host.updateBuilding(n => { n.mods ||= {}; n.mods[ID] = d; }); host.refresh(); } }];
    fields.push({ kind: "check", label: "Enabled in inventory", value: device.enabled !== false, set: v => { device.enabled = v; host.updateBuilding(n => { n.mods ||= {}; n.mods[ID] = d; }); } });
    fields.push({ kind: "text", text: `Interfaces: ${(device.interfaces || []).length}; recorded connections: ${d.connections.filter(c => c.from === device.id || c.to === device.id).length}. Network documentation is not applied to hardware.` });
    fields.push(...inputs(host, device, d));
    return fields;
  },
  menuSheets(host) {
    const b = host.building(); if (!b) return [];
    const d = data(b); const lines = summary(d);
    const duplicate = new Map();
    for (const x of d.devices) for (const i of x.interfaces || []) for (const a of i.addresses || []) { const k = `${a.network || "default"}/${a.address}`; duplicate.set(k, [...(duplicate.get(k)||[]), x.id]); }
    for (const [ip, ids] of duplicate) if (new Set(ids).size > 1) lines.push(`Warning: duplicate ${ip}`);
    const connected = d.connections.map(c => `${d.devices.find(x=>x.id===c.from)?.name || c.from} ${c.fromPort || ""} → ${d.devices.find(x=>x.id===c.to)?.name || c.to} ${c.toPort || ""} (${c.kind})`);
    lines.push(...connected);
    return [{ id: "overview", icon: "⌁", title: "CCTV & Network Infrastructure", lines, chips: [{ label: "Export inventory CSV", onTap: () => { const rows = [["name","category","floor","manufacturer","model","interface","address","mac"]]; for (const x of d.devices) for (const i of x.interfaces || []) for (const a of i.addresses || []) rows.push([x.name || x.id,x.category,x.floorId,x.manufacturer||"",x.model||"",i.name,a.address,i.mac||""]); const csv = rows.map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); const a = document.createElement("a"); a.href=url; a.download="neonplan-infrastructure.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); } }] }];
  }
};
