import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "techpanda/furniture/dist/smart-rgb-previews");
const bundle = resolve(root, "custom_components/neonplan3d/frontend/neonplan3d-smart-rgb.js");
const puppeteer = createRequire(resolve(root, "frontend/package.json"))("puppeteer-core");
if (!existsSync(bundle)) throw new Error("Build frontend/src/smart-rgb-entry.ts before running this preview");
mkdirSync(output, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><title>Smart RGB manager preview</title><style>html,body{margin:0;height:100%;background:#0b1018}techpanda-smart-rgb-manager{height:100vh}</style><techpanda-smart-rgb-manager></techpanda-smart-rgb-manager><script type="module">import '/manager.js'; const item=(id,type,name,w,d,h)=>({id,type,name,x:0,z:0,rotation:0,w,d,h,variant:null,mount_y:1.8}); const building={version:1,floors:[{id:'floor-1',name:'Living room',elevation:0,height:2.7,cut_height:1.3,rooms:[],openings:[],furniture:[item('hex-1','pack:studio.techpanda.smart_rgb_lighting:hexagonal_rgb_frame_lights','Hexagonal RGB Frame Lights',2.4,.12,2.1),item('wall-1','pack:studio.techpanda.smart_rgb_lighting:multizone_geometric_rgb_wall_lights','Multizone Geometric RGB Wall Lights',3.6,.16,2.4)],placements:[],background:null,outdoor:[],ha_floor:null}],settings:{},energy:{},presence:[]}; const states={}; const put=(id,state,attributes={})=>states[id]={entity_id:id,state,attributes}; put('light.hex_led','on',{brightness:220,rgb_color:[40,205,240],effect:'rainbow'}); put('sensor.hex_led_status_raw','true',{brightness:220,color:'#28CDF0',pattern:'rainbow'}); put('input_select.hex_led_pattern','rainbow',{options:['rainbow','solid','rainbow_glitter','confetti','sinelon','juggle','bpm']}); put('input_number.hex_led_speed','80',{}); put('input_text.hex_led_color','#28CDF0',{}); put('light.rgb_lights','on',{brightness:210,rgb_color:[35,185,225],effect:'RAINBOW'}); put('select.rgb_pattern','RAINBOW',{options:['SOLID','RAINBOW','CONFETTI']}); put('sensor.rgb_controller_status','online',{patterns:['SOLID','RAINBOW','CONFETTI'],zones:[0,1,2,3,4].map((id)=>({id,name:['Wall','Monitors','PC Case','Ceiling','Moon Globe'][id],on:id<2,color:id===0?'#c742ff':'#27e7c6',brightness_ha:id<2?220:0,pattern_name:'RAINBOW',frame_ms:70,leds:[120,90,60,150,30][id],max_leds:600}))}); for(const [name,leds] of [['wall',120],['monitors',90],['pc_case',60],['ceiling',150],['moon_globe',30]]) {put('light.rgb_zone_'+name,'on',{brightness:210,rgb_color:[190,55,235],effect:'RAINBOW',effect_list:['SOLID','RAINBOW','CONFETTI']});put('number.rgb_zone_'+name+'_speed','70',{});put('number.rgb_zone_'+name+'_count',String(leds),{});} window.__calls=[]; const el=document.querySelector('techpanda-smart-rgb-manager'); el.hass={states,callService:async(domain,service,data)=>{window.__calls.push({domain,service,data});}}; el.building=building; el.addEventListener('smart-rgb-edit',e=>{window.__building=e.detail;el.building=e.detail;});</script>`;
const server = createServer((req, res) => {
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(html); return; }
  if (req.url === "/manager.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(readFileSync(bundle)); return; }
  if (req.url === "/favicon.ico") { res.writeHead(204).end(); return; }
  res.writeHead(404).end();
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const executablePath = candidates.find(existsSync);
if (!executablePath) { server.close(); throw new Error("Set CHROME_PATH to Chrome or Edge to render the manager preview"); }
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle0" });
  try {
    await page.waitForFunction(() => customElements.get("techpanda-smart-rgb-manager") && document.querySelector("techpanda-smart-rgb-manager")?.shadowRoot?.querySelector("h1"), { timeout: 8000 });
  } catch {
    const state = await page.evaluate(() => ({ registered: !!customElements.get("techpanda-smart-rgb-manager"), html: document.querySelector("techpanda-smart-rgb-manager")?.shadowRoot?.innerHTML.slice(0, 800) }));
    throw new Error(`Manager failed to render: ${JSON.stringify({ state, errors })}`);
  }
  await page.evaluate(() => document.querySelector("techpanda-smart-rgb-manager").updateComplete);
  const hexSvgDebug = await page.evaluate(() => { const svg = document.querySelector("techpanda-smart-rgb-manager").shadowRoot.querySelector("svg"); const line = svg?.querySelector("line"); const rect = line?.getBoundingClientRect(); return { childCount: svg?.childElementCount, namespace: line?.namespaceURI, lineWidth: rect?.width, lineHeight: rect?.height }; });
  if (hexSvgDebug.namespace !== "http://www.w3.org/2000/svg" || !hexSvgDebug.lineWidth || !hexSvgDebug.lineHeight) throw new Error(`Hex layout SVG geometry did not render: ${JSON.stringify(hexSvgDebug)}`);
  const clickAdd = await page.evaluate(() => {
    const host = document.querySelector("techpanda-smart-rgb-manager");
    const target = [...host.shadowRoot.querySelectorAll("polygon")].find(poly => poly.querySelector("title")?.textContent?.startsWith("Add hexagon"));
    if (!target) return false; target.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true })); return true;
  });
  if (!clickAdd) throw new Error("Hexagon layout neighbour control was not rendered");
  await page.waitForFunction(() => window.__building);
  const cellCount = await page.evaluate(() => window.__building.floors[0].furniture[0].mods["studio.techpanda.smart_rgb_lighting"].hex.cells.length);
  if (cellCount !== 4) throw new Error(`Expected shared-edge editor to add one cell; got ${cellCount}`);
  await page.screenshot({ path: resolve(output, "smart-rgb-manager-hex.png"), fullPage: true });
  const selectWall = await page.evaluate(() => {
    const host = document.querySelector("techpanda-smart-rgb-manager");
    const row = [...host.shadowRoot.querySelectorAll("button.row")].find(button => button.textContent.includes("Multizone Geometric"));
    if (!row) return false; row.click(); return true;
  });
  if (!selectWall) throw new Error("Wall fixture could not be selected in the manager");
  await page.waitForFunction(() => [...(document.querySelector("techpanda-smart-rgb-manager")?.shadowRoot?.querySelectorAll("h2") ?? [])].some(heading => heading.textContent?.includes("Grooved triangle")));
  await page.evaluate(() => document.querySelector("techpanda-smart-rgb-manager").updateComplete);
  await page.evaluate(() => {
    const host = document.querySelector("techpanda-smart-rgb-manager");
    const edge = host.shadowRoot.querySelector("line.edge");
    edge?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await page.evaluate(() => document.querySelector("techpanda-smart-rgb-manager").requestUpdate());
  await page.evaluate(() => document.querySelector("techpanda-smart-rgb-manager").updateComplete);
  const assigned = await page.evaluate(() => {
    const host = document.querySelector("techpanda-smart-rgb-manager");
    const selector = host.shadowRoot.querySelector('select[aria-label="Assign selected edge to zone"]');
    if (!selector) return false;
    selector.value = "1"; selector.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  });
  if (!assigned) throw new Error("Selected wall edge did not expose zone assignment");
  await page.waitForFunction(() => Object.values(window.__building?.floors?.[0]?.furniture?.[1]?.mods?.["studio.techpanda.smart_rgb_lighting"]?.wall?.edgeZones ?? {}).includes(1));
  await page.evaluate(() => document.querySelector("techpanda-smart-rgb-manager").updateComplete);
  const wallSvgDebug = await page.evaluate(() => { const svg = document.querySelector("techpanda-smart-rgb-manager").shadowRoot.querySelector("svg"); const polygon = svg?.querySelector("polygon"); const rect = polygon?.getBoundingClientRect(); return { childCount: svg?.childElementCount, namespace: polygon?.namespaceURI, polygonWidth: rect?.width, polygonHeight: rect?.height }; });
  if (wallSvgDebug.namespace !== "http://www.w3.org/2000/svg" || !wallSvgDebug.polygonWidth || !wallSvgDebug.polygonHeight) throw new Error(`Triangular layout SVG geometry did not render: ${JSON.stringify(wallSvgDebug)}`);
  await page.screenshot({ path: resolve(output, "smart-rgb-manager-wall-zones.png"), fullPage: true });
  const callResult = await page.evaluate(() => {
    const host = document.querySelector("techpanda-smart-rgb-manager");
    const button = [...host.shadowRoot.querySelectorAll("button")].find(el => el.textContent.includes("Turn off"));
    button?.click();
    const input = host.shadowRoot.querySelector('input[type="range"][max="255"]');
    if (input) { input.value = "180"; input.dispatchEvent(new Event("change", { bubbles: true, composed: true })); }
    const copy = structuredClone(window.__building);
    const restored = JSON.parse(JSON.stringify(copy));
    const dupe = structuredClone(restored.floors[0].furniture[1]); dupe.id = "wall-2";
    return { calls: window.__calls, copyHasMods: !!copy.floors[0].furniture[0].mods, restoredHasMods: !!restored.floors[0].furniture[0].mods, duplicateKeepsMods: JSON.stringify(dupe.mods) === JSON.stringify(restored.floors[0].furniture[1].mods) };
  });
  if (callResult.calls.length < 2 || !callResult.copyHasMods || !callResult.restoredHasMods || !callResult.duplicateKeepsMods) throw new Error(`Manager interaction, HA service mock, save/reload or duplicate check failed: ${JSON.stringify(callResult)}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  writeFileSync(resolve(output, "smart-rgb-manager-browser-check.json"), JSON.stringify({ cellCount, callResult, hexSvgDebug, wallSvgDebug, errors }, null, 2));
  console.log(`Manager interaction checks passed. Screenshots: ${output}`);
} finally {
  await browser.close();
  server.close();
}
