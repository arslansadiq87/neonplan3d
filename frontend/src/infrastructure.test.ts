import assert from "node:assert/strict";
import test from "node:test";
import { cameraCoverageFootprint, duplicateAddressWarnings, duplicateInfrastructureFurniture, estimateInfrastructureCableLength, infrastructureRouteSegments, furnitureCameraPose, infrastructureCategory, readInfrastructure, removeInfrastructureFurniture, setInfrastructureChannel, validAddress, validMac, validSubnet, validateInfrastructure, infrastructureSummary, type InfrastructurePlan } from "./infrastructure.ts";
import { emptyBuilding } from "./model.ts";
import { exportFile, parseExport } from "./transfer.ts";

test("validates IPv4, IPv6, CIDR and MAC documentation", () => {
  assert.equal(validAddress("192.168.1.10/24"), true);
  assert.equal(validAddress("2001:db8::1/64"), true);
  assert.equal(validAddress("300.1.1.1/24"), false);
  assert.equal(validAddress("192.168.1.1/33"), false);
  assert.equal(validSubnet("10.0.0.0/8"), true);
  assert.equal(validSubnet("10.0.0.0/40"), false);
  assert.equal(validMac("A0:B1:C2:D3:E4:F5"), true);
  assert.equal(validMac("not-a-mac"), false);
});

test("recognizes CCTV equipment IDs stored in signed furniture pack types", () => {
  assert.equal(infrastructureCategory("pack:studio.techpanda.cctv_network:xvr"), "recorder");
  assert.equal(infrastructureCategory("pack:studio.techpanda.cctv_network:analog_bullet_camera"), "camera_analog");
  assert.equal(infrastructureCategory("pack:studio.techpanda.cctv_network:router"), "router");
  assert.equal(infrastructureCategory("pack:unrelated.pack:sofa"), null);
});

test("duplicate IP warnings are scoped to logical networks", () => {
  const p: InfrastructurePlan = { version: 1, devices: [
    { id: "a", furnitureId: "fa", floorId: "g", category: "router", enabled: true, interfaces: [{ id: "lan", name: "LAN", kind: "ethernet", addresses: [{ address: "192.168.1.1", prefix: 24, network: "home" }] }] },
    { id: "b", furnitureId: "fb", floorId: "g", category: "camera_ip", enabled: true, interfaces: [{ id: "eth", name: "Ethernet", kind: "ethernet", addresses: [{ address: "192.168.1.1", prefix: 24, network: "isolated" }] }] },
    { id: "c", furnitureId: "fc", floorId: "g", category: "camera_ip", enabled: true, interfaces: [{ id: "eth", name: "Ethernet", kind: "ethernet", addresses: [{ address: "192.168.1.1", prefix: 24, network: "home" }] }] },
  ], connections: [{ id: "link", from: "a", to: "missing", kind: "ethernet", logical: true }] };
  assert.equal(duplicateAddressWarnings(p.devices).length, 1);
  assert.equal(validateInfrastructure(p).some(x => x.includes("missing device")), true);
  assert.equal(infrastructureSummary(p).cameras, 2);
});

test("camera coverage values are bounded and explicitly estimated", () => {
  const coverage = cameraCoverageFootprint({ id: "c", furnitureId: "f", floorId: "g", category: "camera_ip", enabled: true, camera: { hFov: 240, maxRange: 200, minRange: 30, height: 3, tilt: 120 } });
  assert.deepEqual(coverage && { radius: coverage.radius, near: coverage.near, halfAngle: coverage.halfAngle, tilt: coverage.tilt, estimated: coverage.estimated }, { radius: 100, near: 30, halfAngle: (179 * Math.PI) / 360, tilt: 90, estimated: true });
});

test("furniture camera lens follows heading, mount height and floor elevation", () => {
  const pose = furnitureCameraPose({ x: 4, z: 7, rotation: 0, floorElevation: 3.2, mountY: 1.8, depth: 0.32, itemHeight: 0.12 }, { azimuth: 90, height: 2.7, tilt: 35, hFov: 120, maxRange: 12 });
  assert.ok(pose.x < 4);
  assert.equal(pose.z, 7);
  assert.equal(pose.rotation, 90);
  assert.equal(pose.y, 2.7);
  assert.equal(pose.worldY, 5.9);
  assert.equal(pose.fov, 120);
  assert.equal(pose.reach, 12);
});

test("bullet camera coverage starts at the native lens plane and scales with resized depth", () => {
  const pose = furnitureCameraPose({ x: 2, z: 3, rotation: 0, floorElevation: 0, mountY: 0, depth: 0.32, itemHeight: 0.12, furnitureType: "pack:studio.techpanda.cctv_network:ip_bullet_camera" }, undefined);
  assert.equal(pose.x, 2);
  assert.equal(pose.z, 3 + 0.32 * 0.462);
  const rotated = furnitureCameraPose({ x: 2, z: 3, rotation: 0, floorElevation: 0, mountY: 0, depth: 0.64, itemHeight: 0.12, furnitureType: "pack:studio.techpanda.cctv_network:analog_bullet_camera" }, { azimuth: 90 });
  assert.equal(rotated.x, 2 - 0.64 * 0.462);
  assert.equal(rotated.z, 3);
  const other = furnitureCameraPose({ x: 2, z: 3, rotation: 0, floorElevation: 0, mountY: 0, depth: 0.32, itemHeight: 0.12 }, undefined);
  assert.equal(other.z, 3 + 0.32 * 0.31);
});

test("portable metadata reader tolerates missing and dangling references", () => {
  assert.deepEqual(readInfrastructure(null), { version: 1, devices: [], connections: [] });
  const p = readInfrastructure({ mods: { "techpanda.infrastructure": { version: 1, devices: [{ id: "a", furnitureId: "f", floorId: "g", category: "switch", enabled: true }], connections: [{ id: "x", from: "a", to: "missing", kind: "ethernet", logical: true }] } } });
  assert.equal(p.devices.length, 1);
  assert.equal(p.connections.length, 0);
});

test("recorder channel assignments reject duplicate and invalid channels", () => {
  const p: InfrastructurePlan = { version: 1, devices: [
    { id: "r", furnitureId: "fr", floorId: "g", category: "recorder", enabled: true },
    { id: "c1", furnitureId: "f1", floorId: "g", category: "camera_analog", enabled: true, camera: { recorderId: "r", channel: 1 } },
    { id: "c2", furnitureId: "f2", floorId: "g", category: "camera_analog", enabled: true },
  ], connections: [] };
  assert.equal(setInfrastructureChannel(p, "c2", "r", 1), false);
  assert.equal(setInfrastructureChannel(p, "c2", "r", 2), true);
  assert.equal(p.devices[2].camera?.channel, 2);
  assert.equal(setInfrastructureChannel(p, "c2", "missing", 3), false);
});

test("infrastructure metadata survives private plan export and import", () => {
  const b = emptyBuilding();
  const plan: InfrastructurePlan = { version: 1, devices: [{ id: "cam", furnitureId: "f_cam", floorId: "g", category: "camera_ip", enabled: true, name: "Front door", camera: { hFov: 100, maxRange: 9 }, bindings: { camera: "camera.front" } }], connections: [] };
  b.mods = { "techpanda.infrastructure": plan as unknown as Record<string, unknown> };
  const restored = parseExport(JSON.stringify(exportFile(b, false)));
  assert.deepEqual(readInfrastructure(restored), plan);
});

test("deletion cleans dependent connections and duplication receives independent identity", () => {
  const p: InfrastructurePlan = { version: 1, devices: [
    { id: "a", furnitureId: "fa", floorId: "g", category: "router", enabled: true },
    { id: "b", furnitureId: "fb", floorId: "g", category: "camera_ip", enabled: true },
  ], connections: [{ id: "ab", from: "a", to: "b", kind: "ethernet", logical: true }] };
  assert.equal(removeInfrastructureFurniture(p, new Set(["fa"])).connections.length, 0);
  const copy = duplicateInfrastructureFurniture(p, new Map([["fa", "fa2"], ["fb", "fb2"]]), (() => { let i = 0; return () => `copy${++i}`; })());
  assert.equal(copy.devices.find(x => x.furnitureId === "fb2")?.id, "copy2");
  assert.equal(copy.connections.length, 2);
  assert.deepEqual([copy.connections[1].from, copy.connections[1].to], ["copy1", "copy2"]);
});

test("cross-floor cable length uses real elevations and waypoints, not apart offsets",()=>{
  const building={floors:[{id:"g",elevation:0,furniture:[{id:"a",x:0,z:0,h:.2,mount_y:0}]},{id:"u",elevation:3,furniture:[{id:"b",x:4,z:0,h:.2,mount_y:0}]}]};
  const c={id:"ab",from:"a",to:"b",kind:"ethernet" as const,logical:false,route:[{floorId:"g",x:1,z:0,y:1},{floorId:"u",x:4,z:0,y:1}]};
  const p:InfrastructurePlan={version:1,devices:[{id:"a",furnitureId:"a",floorId:"g",category:"switch",enabled:true},{id:"b",furnitureId:"b",floorId:"u",category:"camera_ip",enabled:true}],connections:[c]};
  assert.equal(estimateInfrastructureCableLength(building,p,c),6.49);
  const segments=infrastructureRouteSegments(building,p);
  assert.equal(segments.length,3);assert.equal(segments[1].a.floorId,"g");assert.equal(segments[1].b.floorId,"u");
});

test("infrastructure validation checks switch ports, PoE budget and recorder channel capacity",()=>{
  const p:InfrastructurePlan={version:1,devices:[
    {id:"sw",furnitureId:"swf",floorId:"g",category:"switch",enabled:true,switch:{ports:2,poeBudgetW:10},switchPorts:[{id:"p1",number:1,equipmentId:"cam",kind:"poe",poeCapable:false,poeWatts:8},{id:"p2",number:1,equipmentId:"cam",poeWatts:8}]},
    {id:"rec",furnitureId:"rf",floorId:"g",category:"recorder",enabled:true,recorder:{type:"DVR",analogChannels:1}},
    {id:"cam",furnitureId:"cf",floorId:"g",category:"camera_analog",enabled:true,camera:{recorderId:"rec",channel:2}},
  ],connections:[]};
  const warnings=validateInfrastructure(p).join(" ");
  assert.match(warnings,/duplicate switch port/); assert.match(warnings,/assigned to ports/); assert.match(warnings,/not marked PoE capable/); assert.match(warnings,/exceeds the switch budget/); assert.match(warnings,/outside configured capacity/);
});
