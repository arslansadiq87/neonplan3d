import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(dir, "../..");
const frontendRequire = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { build } = frontendRequire("esbuild");
const puppeteer = frontendRequire("puppeteer-core");
const source = resolve(process.argv[2] ?? "");
const output = resolve(process.argv[3] ?? resolve(dir, "dist/previews"));
if (!process.argv[2] || !existsSync(source)) throw new Error("Usage: node techpanda/furniture/preview.mjs <pack-source.json> [output-directory]");
const packFile = JSON.parse(readFileSync(source, "utf8"));
const pack = packFile.payload ?? packFile;

const generated = resolve(dir, "dist/preview.js");
await build({ entryPoints: [resolve(dir, "preview-entry.ts")], bundle: true, format: "esm", platform: "browser", target: ["chrome94"], nodePaths: [resolve(root, "frontend/node_modules")], outfile: generated, minify: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = path === "/" ? resolve(dir, "preview.html") : path === "/preview.js" ? generated : path === "/source.json" ? source : null;
  if (!file || !file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const executablePath = candidates.find((candidate) => existsSync(candidate));
if (!executablePath) { server.close(); throw new Error("Set CHROME_PATH to Chrome or Edge to render the 3D preview"); }
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await (await import("node:fs/promises")).mkdir(output, { recursive: true });
  const safeName = source.split(/[\\/]/).at(-1).replace(/\.json$/i, "");
  const scenarios = pack.items.flatMap((item) => {
    if (item.id === "hexagonal_rgb_frame_lights") return [
      { id: "hex-default-iso-rainbow", item: item.id, view: "iso", pattern: "rainbow" },
      { id: "hex-front-hollow-centres", item: item.id, view: "front", pattern: "rainbow" },
      { id: "hex-side-frame-depth", item: item.id, view: "side", pattern: "rainbow" },
      { id: "hex-solid-cyan", item: item.id, view: "front", pattern: "solid" },
      { id: "hex-multicolour-rainbow", item: item.id, view: "iso", pattern: "rainbow_glitter" },
      { id: "hex-powered-off", item: item.id, view: "iso", pattern: "solid", power: "off" },
      { id: "hex-expanded-shared-bars", item: item.id, view: "iso", pattern: "rainbow", layout: "expanded" },
      { id: "paired-wall-and-hex", item: item.id, view: "iso", pattern: "rainbow", companion: "multizone_geometric_rgb_wall_lights" },
    ];
    if (item.id === "multizone_geometric_rgb_wall_lights") return [
      { id: "wall-full-triangular-layout", item: item.id, view: "iso", pattern: "RAINBOW", zones: "multi" },
      { id: "wall-groove-detail", item: item.id, view: "front", pattern: "RAINBOW", w: 2.4, h: 2.0 },
      { id: "wall-raised-side-profile", item: item.id, view: "side", pattern: "RAINBOW" },
      { id: "wall-concealed-edge-strips", item: item.id, view: "iso", pattern: "SOLID", zones: "multi" },
      { id: "wall-independent-rgb-zones", item: item.id, view: "iso", pattern: "RAINBOW", zones: "multi" },
      { id: "wall-rainbow-gradients", item: item.id, view: "front", pattern: "RAINBOW", zones: "multi" },
      { id: "wall-solid-colour", item: item.id, view: "iso", pattern: "SOLID", zones: "multi" },
      { id: "wall-powered-off", item: item.id, view: "iso", pattern: "SOLID", zones: "multi", power: "off" },
      { id: "paired-hex-and-wall", item: item.id, view: "iso", pattern: "RAINBOW", zones: "multi", companion: "hexagonal_rgb_frame_lights" },
    ];
    if (item.id === "cylindrical_water_tank") return [
      { id: "cylindrical-iso-default", item: item.id, view: "iso", level: "none" },
      { id: "cylindrical-top", item: item.id, view: "top", level: "none" },
      { id: "cylindrical-side", item: item.id, view: "side", level: "none" },
      { id: "cylindrical-rooftop-50", item: item.id, view: "iso", level: "50", mount: 3.35 },
      { id: "cylindrical-level-100", item: item.id, view: "iso", level: "100" },
      { id: "cylindrical-resized", item: item.id, view: "iso", level: "none", w: 1.8, d: 1.8, h: 2.2 },
    ];
    if (item.id === "ro_plant") return [
      { id: "ro-plant-iso", item: item.id, view: "iso", level: "none" },
      { id: "ro-plant-front", item: item.id, view: "front", level: "none" },
      { id: "ro-plant-side", item: item.id, view: "side", level: "none" },
      { id: `${item.id}-utility-with-tank`, item: item.id, view: "iso", level: "none", companion: "cylindrical_water_tank" },
      { id: `${item.id}-elevated`, item: item.id, view: "iso", level: "none", mount: 3.35 },
    ];
    if (item.id === "rectangular_water_tank") return [
      { id: "rectangular-default", item: item.id, view: "iso", level: "none" },
      ...[0, 25, 50, 75, 100].map((level) => ({ id: `rectangular-level-${String(level).padStart(3, "0")}`, item: item.id, view: "iso", level: String(level) })),
      { id: "rectangular-level-unknown", item: item.id, view: "iso", level: "unknown" },
      { id: "rectangular-width-only", item: item.id, view: "iso", level: "none", w: 3.0 },
      { id: "rectangular-depth-only", item: item.id, view: "iso", level: "none", d: 2.25 },
      { id: "rectangular-height-only", item: item.id, view: "iso", level: "none", h: 2.25 },
      { id: "rectangular-rotation-90", item: item.id, view: "iso", level: "none", rotation: 90 },
      { id: "rectangular-mount-3.35m", item: item.id, view: "iso", level: "none", mount: 3.35 },
      { id: "rectangular-mount-6.71m", item: item.id, view: "iso", level: "none", mount: 6.71 },
    ];
    return [];
  });
  for (const scenario of scenarios) {
    const query = new URLSearchParams({ source: "/source.json", ...Object.fromEntries(Object.entries(scenario).map(([key, value]) => [key, String(value)])) });
    await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#preview")?.complete && document.querySelector("#status")?.textContent?.startsWith("Rendered"));
    const filename = `${safeName}--${scenario.id}.png`;
    await page.screenshot({ path: resolve(output, filename), fullPage: true });
    console.log(`Preview written to ${resolve(output, filename)}`);
  }
} finally {
  await browser.close();
  server.close();
}
