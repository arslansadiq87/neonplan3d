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
  const scenarios = [
    { id: "default-no-sensor", level: "none" },
    ...[0, 25, 50, 75, 100].map((level) => ({ id: `level-${String(level).padStart(3, "0")}`, level: String(level) })),
    { id: "level-unknown", level: "unknown" },
    { id: "width-only", level: "none", w: 3.0 },
    { id: "depth-only", level: "none", d: 2.25 },
    { id: "height-only", level: "none", h: 2.25 },
    { id: "rotation-90", level: "none", rotation: 90 },
    { id: "mount-3.35m", level: "none", mount: 3.35 },
    { id: "mount-6.71m", level: "none", mount: 6.71 },
  ];
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
