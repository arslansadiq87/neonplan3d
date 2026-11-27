import { css, html, LitElement, nothing, svg, type PropertyValues } from "lit";
import type { Building, Furniture } from "./model.ts";
import type { HomeAssistant } from "./types.ts";
import { callSmartRgbEntity, setSmartRgbHelper, setSmartRgbPattern } from "./smart-rgb-services.ts";
import { defaultZoneChoices, readSmartRgbConfig, smartRgbType, writeSmartRgbConfig, type SmartRgbConfig, type SmartRgbZone } from "./smart-rgb-config.ts";
import { hexFrameEdges, insetTriangle, limitedTriangleGrooves, trianglePanelEdges, triangularPanels, type HexCell, type PlanePoint } from "./smart-rgb-geometry.ts";

type DeviceRow = { item: Furniture; floor: Building["floors"][number]; kind: "hex" | "triangles" };
type FirmwareZone = { id: number; name: string; on?: boolean; color?: string; brightness?: number; brightness_pct?: number; brightness_ha?: number; frame_ms?: number; leds?: number; max_leds?: number; pattern_name?: string };
const HEX_PATTERNS = ["rainbow", "solid", "rainbow_glitter", "confetti", "sinelon", "juggle", "bpm"];

/** Lazy loaded layout editor and Home Assistant control surface for the two smart RGB models. */
class TechPandaSmartRgbManager extends LitElement {
  static properties = { building: { attribute: false }, hass: { attribute: false }, selected: { type: String }, selectedEdge: { type: String } };
  declare building: Building | null;
  declare hass: HomeAssistant | undefined;
  declare selected: string;
  declare selectedEdge: string;

  static styles = css`
    :host{display:block;height:100%;overflow:auto;color:#e3edf4;background:radial-gradient(ellipse at 12% 0%,#193046 0,transparent 46%),#0b1018;font:14px system-ui,sans-serif;padding:18px;box-sizing:border-box}
    *{box-sizing:border-box}header{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1420px;margin:0 auto 16px}h1{font-size:22px;margin:0;letter-spacing:.01em}h2{font-size:16px;margin:0 0 12px}h3{font-size:13px;color:#9cb7c4;margin:18px 0 8px}.sub,.hint{font-size:12px;color:#8799a6;line-height:1.45}.layout{display:grid;grid-template-columns:minmax(230px,280px) minmax(0,1fr) minmax(250px,320px);gap:12px;max-width:1420px;margin:auto;align-items:start}.card{border:1px solid #263744;border-radius:10px;background:#111b25;padding:14px;min-width:0}.zonebox{margin:10px 0;padding:10px;border:1px solid #273b48;border-radius:8px;background:#0c151e}.zonebox>strong{font-size:12px;color:#b9d9db}.list{display:grid;gap:6px}.row,button,select,input{font:inherit;color:inherit}.row,button,select,input{border:1px solid #354a59;background:#14212b;border-radius:7px;padding:8px 10px}.row{display:flex;flex-direction:column;text-align:left;gap:3px;cursor:pointer}.row[aria-pressed=true],button[aria-pressed=true]{border-color:#50d6d4;background:#172c35}.muted{color:#8da0ad;font-size:12px}.pill{color:#8de2d8;font-size:11px;letter-spacing:.04em;text-transform:uppercase}.preview{width:100%;min-height:260px;border:1px solid #263744;border-radius:8px;background:#0b121a;display:block;touch-action:manipulation}.preview polygon{stroke:#576978;stroke-width:1.2;cursor:pointer}.preview polygon.raised{fill:#263b49}.preview polygon.flat{fill:#1a222a}.preview polygon:hover{stroke:#93d3d2}.preview line.groove{stroke:#73808a;stroke-width:.7;opacity:.74;pointer-events:none}.preview line.edge{stroke:#73a5aa;stroke-width:3;opacity:.45;cursor:pointer}.preview line.edge.assigned{stroke-width:5;opacity:.96}.preview line.edge.selected{stroke:#ffffff;stroke-width:7;opacity:1}.hexbar{stroke:#85929b;stroke-width:9;stroke-linecap:round;cursor:pointer}.hexbar.shared{stroke:#b8c7cc}.connector{fill:#101820;stroke:#56636b;stroke-width:1}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{display:grid;gap:4px;color:#9eb1bc;font-size:11px}.field input,.field select{width:100%;min-width:0}.wide{grid-column:1/-1}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}button{cursor:pointer}button:hover,select:hover,input:hover{border-color:#63b6bc}.slider{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;margin:10px 0}.slider input{grid-column:1/-1;width:100%;padding:0;accent-color:#66c6c3}.status{border-left:2px solid #4f8791;padding-left:9px;color:#a8bdc4;font-size:12px;margin:9px 0}.warning{border-left:2px solid #dfb06c;padding:8px 10px;background:#2b251c;color:#e5c28c;font-size:12px;margin-top:9px}.entity{display:grid;grid-template-columns:1fr 1.2fr;align-items:center;gap:8px;margin:6px 0;font-size:11px;color:#9eb1bc}.entity select{min-width:0;width:100%;font-size:11px}.selection{padding:8px;border:1px solid #314753;border-radius:7px;color:#b3d4d8;font-size:12px}@media(max-width:1050px){.layout{grid-template-columns:240px minmax(0,1fr)}.layout>.controls{grid-column:1/-1}}@media(max-width:680px){:host{padding:10px}.layout{grid-template-columns:1fr}.layout>.controls{grid-column:auto}.fields{grid-template-columns:1fr 1fr}}
  `;

  constructor() { super(); this.building = null; this.hass = undefined; this.selected = ""; this.selectedEdge = ""; }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("building") && !this.rows().some(row => row.item.id === this.selected)) this.selected = this.rows()[0]?.item.id ?? "";
  }

  private rows(): DeviceRow[] {
    return (this.building?.floors ?? []).flatMap(floor => floor.furniture.flatMap(item => {
      const kind = smartRgbType(item.type);
      return kind ? [{ item, floor, kind }] : [];
    }));
  }

  private get row(): DeviceRow | undefined { return this.rows().find(row => row.item.id === this.selected) ?? this.rows()[0]; }
  private get config(): SmartRgbConfig | null { return this.row ? readSmartRgbConfig(this.row.item) : null; }
  private get zones(): FirmwareZone[] {
    const sensor = this.state(this.config?.bindings.status);
    const zones = sensor?.attributes?.zones;
    return Array.isArray(zones) ? zones.filter((z): z is FirmwareZone => !!z && Number.isInteger((z as FirmwareZone).id)) : [];
  }

  private state(id: string | undefined) { return id ? this.hass?.states?.[id] : undefined; }
  private entities(domain: string): string[] { return Object.keys(this.hass?.states ?? {}).filter(id => id.startsWith(`${domain}.`)).sort(); }
  private zonesForUi(): SmartRgbZone[] { return this.config?.wall?.zones ?? defaultZoneChoices().map(zone => ({ ...zone })); }

  private edit(mutate: (building: Building, item: Furniture, config: SmartRgbConfig) => void): void {
    if (!this.building || !this.row || !this.config) return;
    const next = structuredClone(this.building);
    const target = next.floors.find(floor => floor.id === this.row!.floor.id)?.furniture.find(item => item.id === this.row!.item.id);
    if (!target) return;
    const config = readSmartRgbConfig(target);
    if (!config) return;
    mutate(next, target, config);
    writeSmartRgbConfig(target, config);
    this.dispatchEvent(new CustomEvent("smart-rgb-edit", { detail: next, bubbles: true, composed: true }));
  }

  private setBinding(slot: string, entity: string): void {
    this.edit((_building, _item, config) => { config.bindings[slot] = entity; });
  }

  private setHex<K extends keyof NonNullable<SmartRgbConfig["hex"]>>(key: K, value: NonNullable<SmartRgbConfig["hex"]>[K]): void {
    this.edit((_building, _item, config) => { if (config.hex) config.hex[key] = value; });
  }

  private setWall<K extends keyof NonNullable<SmartRgbConfig["wall"]>>(key: K, value: NonNullable<SmartRgbConfig["wall"]>[K]): void {
    this.edit((_building, _item, config) => {
      if (!config.wall) return;
      config.wall[key] = value;
      if (key === "rows" || key === "columns") {
        const panels = triangularPanels(config.wall.rows, config.wall.columns, 1);
        const edges = new Set(trianglePanelEdges(panels).map(edge => edge.id));
        const panelIds = new Set(panels.map(panel => panel.id));
        config.wall.edgeZones = Object.fromEntries(Object.entries(config.wall.edgeZones).filter(([id]) => edges.has(id)));
        config.wall.raisedPanels = config.wall.raisedPanels.filter(id => panelIds.has(id));
      }
    });
  }

  private setZone(index: number, key: keyof SmartRgbZone, value: string | number | boolean | null): void {
    const zones = this.config?.wall?.zones;
    if (!zones?.[index]) return;
    const next = zones.map(zone => ({ ...zone }));
    const oldId = next[index].id;
    if (key === "id") {
      const id = Number(value);
      if (!Number.isInteger(id) || id < 0 || id > 4 || next.some((zone, i) => i !== index && zone.id === id)) return;
      next[index].id = id;
    } else if (key === "name") next[index].name = String(value).trim() || `Zone ${next[index].id}`;
    else if (key === "entity" || key === "speedEntity" || key === "countEntity") next[index][key] = String(value);
    else if (key === "ledLength") next[index].ledLength = value === null ? undefined : Number(value);
    else if (key === "ledCount") next[index].ledCount = value === null ? null : Number(value);
    else if (key === "reverse") next[index].reverse = Boolean(value);
    if (key === "id" && oldId !== next[index].id) {
      this.edit((_building, _item, config) => {
        if (!config.wall) return;
        config.wall.zones = next;
        config.wall.edgeZones = Object.fromEntries(Object.entries(config.wall.edgeZones).map(([edge, id]) => [edge, id === oldId ? next[index].id : id]));
      });
    } else this.setWall("zones", next);
  }

  private callLight(entity: string, service: "turn_on" | "turn_off", data: Record<string, unknown> = {}): void {
    void callSmartRgbEntity(this.hass, entity, service, data);
  }

  private patternOptions(entity: string): string[] {
    const state = this.state(entity);
    const opts = state?.attributes?.options;
    if (Array.isArray(opts) && opts.length) return opts.map(String);
    const effects = this.state(this.config?.bindings.light)?.attributes?.effect_list;
    if (Array.isArray(effects) && effects.length) return effects.map(String);
    return this.row?.kind === "hex" ? HEX_PATTERNS : [];
  }

  private setPattern(value: string): void {
    const entity = this.config?.bindings.pattern;
    if (!entity || !this.state(entity)) return;
    void setSmartRgbPattern(this.hass, entity, value);
  }

  private setSpeed(value: number): void {
    const entity = this.config?.bindings.speed;
    void setSmartRgbHelper(this.hass, entity, value);
  }

  private setZoneSpeed(entity: string | undefined, value: number): void {
    void setSmartRgbHelper(this.hass, entity, value);
  }

  private setLightColor(entity: string, color: string): void {
    if (!this.state(entity) || !/^#[0-9a-f]{6}$/i.test(color)) return;
    const n = color.slice(1);
    this.callLight(entity, "turn_on", { rgb_color: [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16)) });
  }

  private setSolidColor(color: string): void {
    const entity = this.config?.bindings.color;
    void setSmartRgbHelper(this.hass, entity, color.toUpperCase());
  }

  private hexCellPoints(cell: HexCell, side: number, project: (p: PlanePoint) => PlanePoint): string {
    const cx = 1.5 * side * cell.q;
    const cy = Math.sqrt(3) * side * (cell.r + cell.q / 2);
    return Array.from({ length: 6 }, (_, i) => project([cx + Math.cos(i * Math.PI / 3) * side, cy + Math.sin(i * Math.PI / 3) * side]).join(",")).join(" ");
  }

  private renderHexLayout(config: SmartRgbConfig) {
    const model = config.hex!;
    const edges = hexFrameEdges(model.cells, model.sideLength);
    const bound = edges.flatMap(edge => [edge.a, edge.b]);
    const minX = Math.min(...bound.map(p => p[0])); const maxX = Math.max(...bound.map(p => p[0]));
    const minY = Math.min(...bound.map(p => p[1])); const maxY = Math.max(...bound.map(p => p[1]));
    const scale = Math.min(440 / (maxX - minX || 1), 320 / (maxY - minY || 1));
    const project = ([x, y]: PlanePoint): PlanePoint => [270 + (x - (minX + maxX) / 2) * scale, 180 - (y - (minY + maxY) / 2) * scale];
    const cells = new Set(model.cells.map(cell => `${cell.q},${cell.r}`));
    const neighbors = model.cells.flatMap(cell => [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([q, r]) => ({ q: cell.q + q, r: cell.r + r }))).filter(cell => !cells.has(`${cell.q},${cell.r}`));
    const uniqueNeighbors = [...new Map(neighbors.map(cell => [`${cell.q},${cell.r}`, cell])).values()];
    const toggleCell = (cell: HexCell, present: boolean) => {
      const next = model.cells.filter(c => !(c.q === cell.q && c.r === cell.r));
      if (!present) next.push(cell);
      if (next.length) this.setHex("cells", next);
    };
    return svg`<svg class="preview" viewBox="0 0 540 360" aria-label="Hexagon frame arrangement preview">
      ${uniqueNeighbors.map(cell => svg`<polygon points=${this.hexCellPoints(cell, model.sideLength, project)} fill="none" stroke="#32424d" stroke-dasharray="5 5" stroke-width="1.2" @click=${() => toggleCell(cell, false)}><title>Add hexagon ${cell.q},${cell.r}</title></polygon>`)}
      ${model.cells.map(cell => svg`<polygon points=${this.hexCellPoints(cell, model.sideLength, project)} fill="none" stroke="none" @click=${() => toggleCell(cell, true)}><title>Remove hexagon ${cell.q},${cell.r}</title></polygon>`)}
      ${edges.map(edge => { const a = project(edge.a); const b = project(edge.b); return svg`<line class="hexbar ${edge.owners.length > 1 ? "shared" : ""}" x1=${a[0]} y1=${a[1]} x2=${b[0]} y2=${b[1]}></line>`; })}
      ${[...new Map(edges.flatMap(edge => [[edge.a.join(","), edge.a], [edge.b.join(","), edge.b]])).values()].map(point => { const p = project(point); return svg`<circle class="connector" cx=${p[0]} cy=${p[1]} r="4"></circle>`; })}
    </svg>
    <div class="hint">Click an outlined neighbour to add a frame. Click an occupied hexagon to remove it. Shared sides render once. Item resizing scales the complete arrangement together.</div>
    <div class="fields" style="margin-top:12px">
      ${this.numberField("Hex side length (m)", model.sideLength, 0.08, 1.2, 0.01, value => this.setHex("sideLength", value))}
      ${this.numberField("Housing width (m)", model.housingWidth, 0.01, 0.18, 0.002, value => this.setHex("housingWidth", value))}
      ${this.numberField("Housing depth (m)", model.housingDepth, 0.01, 0.12, 0.002, value => this.setHex("housingDepth", value))}
      ${this.numberField("Diffuser width (m)", model.diffuserWidth, 0.005, 0.06, 0.001, value => this.setHex("diffuserWidth", value))}
      ${this.numberField("Connector gap (m)", model.connectorGap, 0, 0.08, 0.001, value => this.setHex("connectorGap", value))}
    </div>`;
  }

  private renderWallLayout(config: SmartRgbConfig) {
    const model = config.wall!;
    const panels = triangularPanels(model.rows, model.columns, model.panelSide, model.grooveDirection);
    const edges = trianglePanelEdges(panels);
    const pts = panels.flatMap(panel => panel.vertices);
    const minX = Math.min(...pts.map(p => p[0])); const maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1])); const maxY = Math.max(...pts.map(p => p[1]));
    const scale = Math.min(450 / (maxX - minX || 1), 320 / (maxY - minY || 1));
    const project = ([x, y]: PlanePoint): PlanePoint => [270 + (x - (minX + maxX) / 2) * scale, 180 - (y - (minY + maxY) / 2) * scale];
    const zoneColors = ["#3bc9bb", "#50b7d5", "#aa7ce1", "#e2a55e", "#d9688c"];
    const zoneById = new Map(this.zonesForUi().map(zone => [zone.id, zone]));
    const toggleRaised = (id: string) => this.setWall("raisedPanels", model.raisedPanels.includes(id) ? model.raisedPanels.filter(x => x !== id) : [...model.raisedPanels, id]);
    const selectEdge = (id: string) => { this.selectedEdge = id; this.requestUpdate(); };
    const selectedZone = model.edgeZones[this.selectedEdge];
    const assignEdge = (value: string) => {
      const next = { ...model.edgeZones };
      if (value === "off") delete next[this.selectedEdge]; else next[this.selectedEdge] = Number(value);
      this.setWall("edgeZones", next);
    };
    return svg`<svg class="preview" viewBox="0 0 540 360" aria-label="Triangular ribbed wall layout editor">
      ${panels.map(panel => {
        const inset = insetTriangle(panel.vertices, model.panelGap);
        const p = inset.map(project);
        const raised = model.raisedPanels.includes(panel.id);
        const angle = panel.grooveAngle + 90;
        const grooves = limitedTriangleGrooves(inset, angle, model.grooveSpacing, model.panelGap * 0.75);
        return svg`<g>
          <polygon class=${raised ? "raised" : "flat"} points=${p.map(x => x.join(",")).join(" ")} @click=${() => toggleRaised(panel.id)}><title>${raised ? "Lower" : "Raise"} ${panel.id}</title></polygon>
          ${grooves.map(([a, b]) => { const p0 = project(a); const p1 = project(b); return svg`<line class="groove" x1=${p0[0]} y1=${p0[1]} x2=${p1[0]} y2=${p1[1]}></line>`; })}
        </g>`;
      })}
      ${edges.map(edge => { const a = project(edge.a); const b = project(edge.b); const zone = model.edgeZones[edge.id]; const cls = this.selectedEdge === edge.id ? "edge selected" : zone === undefined ? "edge" : "edge assigned"; return svg`<line class=${cls} stroke=${zone === undefined ? undefined : zoneColors[zone % zoneColors.length]} x1=${a[0]} y1=${a[1]} x2=${b[0]} y2=${b[1]} @click=${() => selectEdge(edge.id)}><title>${zone === undefined ? "Select and assign an RGB edge" : `Zone ${zoneById.get(zone)?.name ?? zone}; click to edit`}</title></line>`; })}
    </svg>
    <div class="hint">Click a triangle to raise or lower it. Click an edge, then assign it to a firmware zone. Only assigned edges emit; many edges may share one zone.</div>
    ${this.selectedEdge ? html`<div class="selection" style="margin-top:10px">Selected edge · <select aria-label="Assign selected edge to zone" .value=${selectedZone === undefined ? "off" : String(selectedZone)} @change=${(e: Event) => assignEdge((e.target as HTMLSelectElement).value)}><option value="off">No RGB strip</option>${this.zonesForUi().map(zone => html`<option value=${zone.id}>${zone.name} · zone ${zone.id}</option>`)}</select></div>` : nothing}
    <div class="fields" style="margin-top:12px">
      ${this.numberField("Rows", model.rows, 1, 16, 1, value => this.setWall("rows", Math.round(value)))}
      ${this.numberField("Columns", model.columns, 1, 16, 1, value => this.setWall("columns", Math.round(value)))}
      ${this.numberField("Panel side (m)", model.panelSide, 0.15, 1.5, 0.01, value => this.setWall("panelSide", value))}
      ${this.numberField("Panel spacing (m)", model.panelGap, 0, 0.04, 0.001, value => this.setWall("panelGap", value))}
      ${this.numberField("Panel thickness (m)", model.panelThickness, 0.005, 0.1, 0.002, value => this.setWall("panelThickness", value))}
      ${this.numberField("Raised depth (m)", model.raisedDepth, 0.002, 0.08, 0.001, value => this.setWall("raisedDepth", value))}
      ${this.numberField("Groove spacing (m)", model.grooveSpacing, 0.008, 0.12, 0.002, value => this.setWall("grooveSpacing", value))}
      ${this.numberField("Groove direction (°)", model.grooveDirection, 0, 180, 5, value => this.setWall("grooveDirection", value))}
      ${this.numberField("Groove relief (m)", model.grooveDepth, 0.0005, 0.01, 0.0005, value => this.setWall("grooveDepth", value))}
    </div>`;
  }

  private numberField(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void) {
    return html`<label class="field">${label}<input type="number" .value=${String(value)} min=${min} max=${max} step=${step} @change=${(e: Event) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n) && n >= min && n <= max) set(n); }}></label>`;
  }

  private entityPicker(label: string, slot: string, domain: string) {
    const config = this.config!;
    const chosen = config.bindings[slot] ?? "";
    const items = this.entities(domain);
    const state = this.state(chosen);
    const shown = state ? `${state.state}${state.attributes?.friendly_name ? ` · ${state.attributes.friendly_name}` : ""}` : chosen ? "Unknown / Unconfigured" : "Unconfigured";
    return html`<label class="entity"><span>${label}<br><small>${shown}</small></span><select .value=${chosen} @change=${(e: Event) => this.setBinding(slot, (e.target as HTMLSelectElement).value)}><option value="">Unconfigured</option>${chosen && !items.includes(chosen) ? html`<option value=${chosen}>${chosen}</option>` : nothing}${items.map(id => html`<option value=${id}>${id}</option>`)}</select></label>`;
  }

  private renderControls(config: SmartRgbConfig) {
    const hex = config.kind === "hex";
    const lightId = config.bindings.light;
    const light = this.state(lightId);
    const patternId = config.bindings.pattern;
    const patternEntity = this.state(patternId);
    const patterns = this.patternOptions(patternId);
    const selectedPattern = patternEntity?.state ?? light?.attributes?.effect ?? "";
    const brightness = Number(light?.attributes?.brightness ?? 0);
    const speedId = config.bindings.speed;
    const speed = Number(this.state(speedId)?.state ?? 0);
    const zones = this.zones;
    return html`<section class="card controls"><h2>Home Assistant controls</h2>
      <div class="status">${light ? `${lightId} · ${light.state}` : `${lightId} · Unknown / Unconfigured`}</div>
      <div class="actions"><button @click=${() => this.callLight(lightId, light?.state === "on" ? "turn_off" : "turn_on")}>${light?.state === "on" ? "Turn off" : "Turn on"}</button><button @click=${() => this.callLight(lightId, "turn_on", { brightness: Math.max(1, brightness || 255) })}>Restore brightness</button></div>
      <label class="slider"><span>Brightness</span><output>${Math.round(brightness / 255 * 100)}%</output><input type="range" min="0" max="255" .value=${String(brightness)} @change=${(e: Event) => this.callLight(lightId, "turn_on", { brightness: Number((e.target as HTMLInputElement).value) })}></label>
      <label class="slider"><span>3D glow intensity</span><output>${Math.round(config.glowIntensity * 100)}%</output><input type="range" min="0" max="1.5" step="0.05" .value=${String(config.glowIntensity)} @change=${(e: Event) => this.edit((_b, _i, cfg) => { cfg.glowIntensity = Number((e.target as HTMLInputElement).value); })}></label>
      ${patterns.length ? html`<label class="field">Pattern<select .value=${String(selectedPattern)} @change=${(e: Event) => this.setPattern((e.target as HTMLSelectElement).value)}>${patterns.map(pattern => html`<option value=${pattern}>${pattern}</option>`)}</select></label>` : html`<div class="warning">${patternId ? `${patternId} has no reported options.` : "Pattern entity is unconfigured."}</div>`}
      ${speedId ? html`<label class="slider"><span>Animation frame timing</span><output>${Number.isFinite(speed) ? `${speed} ms` : "Unknown"}</output><input type="range" min=${hex ? 5 : 1} max=${hex ? 255 : 200} .value=${String(Math.min(hex ? 255 : 200, Math.max(hex ? 5 : 1, speed || 20)))} @change=${(e: Event) => this.setSpeed(Number((e.target as HTMLInputElement).value))}></label>` : nothing}
      ${hex ? html`<label class="field">Solid colour<input type="color" .value=${this.hexInputValue(config.bindings.color)} ?disabled=${!this.state(config.bindings.color)} @change=${(e: Event) => this.setSolidColor((e.target as HTMLInputElement).value)}></label><div class="hint">The configured Home Assistant automation applies colour only in solid mode.</div>` : html`<label class="field">Global RGB colour<input type="color" .value=${this.colorInputValue(light?.attributes?.rgb_color)} ?disabled=${!light} @change=${(e: Event) => this.setLightColor(lightId, (e.target as HTMLInputElement).value)}></label>`}
      <h3>Entity bindings</h3>
      ${hex ? html`${this.entityPicker("Light", "light", "light")}${this.entityPicker("Raw controller status", "status", "sensor")}${this.entityPicker("Pattern selector", "pattern", "input_select")}${this.entityPicker("Animation speed", "speed", "input_number")}${this.entityPicker("Solid colour input", "color", "input_text")}` : html`${this.entityPicker("Global light", "light", "light")}${this.entityPicker("Pattern selector", "pattern", "select")}${this.entityPicker("Controller status", "status", "sensor")}`}
      ${!hex ? this.renderZoneControls(config, zones) : nothing}
      ${!hex && !this.hasZoneEntity() ? html`<div class="warning">Per-zone commands are available in the firmware, but per-zone Home Assistant light entities require the optional package in techpanda/furniture/home-assistant/smart-rgb-zone-controls.yaml. Global entities remain intact.</div>` : nothing}
    </section>`;
  }

  private hasZoneEntity(): boolean { return this.entities("light").some(id => id.startsWith("light.rgb_zone_")); }

  private colorInputValue(value: unknown): string {
    if (Array.isArray(value) && value.length >= 3) return `#${value.slice(0, 3).map(v => Math.max(0, Math.min(255, Number(v) || 0)).toString(16).padStart(2, "0")).join("")}`;
    return "#ffffff";
  }

  private renderZoneControls(config: SmartRgbConfig, reported: FirmwareZone[]) {
    const zones = config.wall?.zones ?? [];
    const rawPatterns = this.state(config.bindings.status)?.attributes?.patterns;
    const patterns = Array.isArray(rawPatterns) ? rawPatterns.map(String) : [];
    return html`<h3>Firmware zones</h3>${reported.length ? reported.map(zone => html`<div class="status">${zone.name} · zone ${zone.id} · ${zone.on === true ? "On" : zone.on === false ? "Off" : "Unknown"} · ${zone.pattern_name ?? "Unknown"} · ${zone.leds ?? "?"}/${zone.max_leds ?? "?"} LEDs</div>`) : html`<div class="warning">${config.bindings.status} has no zones attribute. Zone state remains Unknown / Unconfigured.</div>`}
      ${zones.map((zone, index) => {
        const light = this.state(zone.entity);
        const speed = this.state(zone.speedEntity);
        const effects = Array.isArray(light?.attributes?.effect_list) ? light.attributes.effect_list.map(String) : patterns;
        return html`<div class="zonebox"><strong>${zone.name} · firmware zone ${zone.id}</strong><div class="fields">
          <label class="field">Zone name<input .value=${zone.name} @change=${(e: Event) => this.setZone(index, "name", (e.target as HTMLInputElement).value)}></label>
          <label class="field">Firmware ID<input type="number" min="0" max="4" step="1" .value=${String(zone.id)} @change=${(e: Event) => this.setZone(index, "id", Number((e.target as HTMLInputElement).value))}></label>
          <label class="field">Strip length (m)<input type="number" min="0.1" max="30" step="0.1" .value=${String(zone.ledLength ?? "")} @change=${(e: Event) => { const raw = (e.target as HTMLInputElement).value; this.setZone(index, "ledLength", raw ? Number(raw) : null); }}></label>
          <label class="field">LED count (model)<input type="number" min="1" max="600" step="1" .value=${String(zone.ledCount ?? "")} @change=${(e: Event) => { const raw = (e.target as HTMLInputElement).value; this.setZone(index, "ledCount", raw ? Number(raw) : null); }}></label>
          <label class="entity"><span>Zone light<br><small>${light ? `${zone.entity} · ${light.state}` : `${zone.entity || "Unconfigured"} · Unknown`}</small></span><select .value=${zone.entity} @change=${(e: Event) => this.setZone(index, "entity", (e.target as HTMLSelectElement).value)}><option value="">Unconfigured</option>${this.entities("light").map(id => html`<option value=${id}>${id}</option>`)}</select></label>
          <label class="entity"><span>Speed helper<br><small>${speed ? `${zone.speedEntity} · ${speed.state} ms` : `${zone.speedEntity || "Unconfigured"} · Unknown`}</small></span><select .value=${zone.speedEntity ?? ""} @change=${(e: Event) => this.setZone(index, "speedEntity", (e.target as HTMLSelectElement).value)}><option value="">Unconfigured</option>${[...this.entities("number"), ...this.entities("input_number")].map(id => html`<option value=${id}>${id}</option>`)}</select></label>
          <label class="entity"><span>Hardware count helper<br><small>${this.state(zone.countEntity)?.state ?? "Unknown / Unconfigured"}</small></span><select .value=${zone.countEntity ?? ""} @change=${(e: Event) => this.setZone(index, "countEntity", (e.target as HTMLSelectElement).value)}><option value="">Unconfigured</option>${[...this.entities("number"), ...this.entities("input_number")].map(id => html`<option value=${id}>${id}</option>`)}</select></label>
        </div>
        ${light ? html`<div class="actions"><button @click=${() => this.callLight(zone.entity, light.state === "on" ? "turn_off" : "turn_on")}>${light.state === "on" ? "Turn off zone" : "Turn on zone"}</button><label class="field">Zone colour<input type="color" .value=${this.colorInputValue(light.attributes.rgb_color)} @change=${(e: Event) => this.setLightColor(zone.entity, (e.target as HTMLInputElement).value)}></label>${effects.length ? html`<label class="field">Zone pattern<select .value=${String(light.attributes.effect ?? "")} @change=${(e: Event) => this.callLight(zone.entity, "turn_on", { effect: (e.target as HTMLSelectElement).value })}>${effects.map(effect => html`<option value=${effect}>${effect}</option>`)}</select></label>` : nothing}<label class="field">Reverse strip<input type="checkbox" .checked=${!!zone.reverse} @change=${(e: Event) => this.setZone(index, "reverse", (e.target as HTMLInputElement).checked)}></label></div><label class="slider"><span>Zone brightness</span><output>${Math.round(Number(light.attributes.brightness ?? 0) / 255 * 100)}%</output><input type="range" min="0" max="255" .value=${String(Number(light.attributes.brightness ?? 0))} @change=${(e: Event) => this.callLight(zone.entity, "turn_on", { brightness: Number((e.target as HTMLInputElement).value) })}></label>${speed ? html`<label class="slider"><span>Animation speed</span><output>${speed.state} ms</output><input type="range" min="1" max="200" .value=${String(speed.state)} @change=${(e: Event) => this.setZoneSpeed(zone.speedEntity, Number((e.target as HTMLInputElement).value))}></label>` : nothing}` : html`<label class="field">Reverse strip<input type="checkbox" .checked=${!!zone.reverse} @change=${(e: Event) => this.setZone(index, "reverse", (e.target as HTMLInputElement).checked)}></label>`}
        ${this.state(zone.countEntity) ? html`<label class="slider"><span>Hardware LED count</span><output>${this.state(zone.countEntity)!.state}</output><input type="range" min="1" max="600" .value=${String(this.state(zone.countEntity)!.state)} @change=${(e: Event) => this.setZoneSpeed(zone.countEntity, Number((e.target as HTMLInputElement).value))}></label>` : nothing}</div>`;
      })}`;
  }

  private hexInputValue(entity: string | undefined): string {
    const state = this.state(entity);
    const raw = String(state?.state ?? "#ffffff").trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw : "#ffffff";
  }

  private renderContent(config: SmartRgbConfig) {
    if (config.kind === "hex") return this.renderHexLayout(config);
    return this.renderWallLayout(config);
  }

  protected render() {
    const rows = this.rows();
    const row = this.row;
    const config = this.config;
    return html`<header><div><div class="pill">TechPanda · Smart RGB</div><h1>Build the light into the wall</h1></div><button @click=${() => this.dispatchEvent(new CustomEvent("close-manager", { bubbles: true, composed: true }))}>Close</button></header>
      ${!rows.length ? html`<div class="card"><h2>No smart RGB fixtures in this plan</h2><div class="sub">Import the signed furniture pack and place a Hexagonal RGB Frame Lights or Multizone Geometric RGB Wall Lights item first.</div></div>` : html`<main class="layout">
        <section class="card"><h2>Installed fixtures</h2><div class="list">${rows.map(entry => html`<button class="row" aria-pressed=${entry.item.id === row?.item.id} @click=${() => { this.selected = entry.item.id; this.selectedEdge = ""; }}><span>${entry.item.name || (entry.kind === "hex" ? "Hexagonal RGB Frame Lights" : "Multizone Geometric RGB Wall Lights")}</span><span class="muted">${entry.floor.name} · ${entry.item.w.toFixed(2)} × ${entry.item.h.toFixed(2)} m</span></button>`)}</div></section>
        <section class="card"><h2>${row?.kind === "hex" ? "Connected hexagon frame" : "Grooved triangle wall"}</h2><div class="sub">${row?.kind === "hex" ? "Straight RGB bars share one housing along common hexagon sides." : "Dark ribbed panels; only explicitly assigned edges emit RGB."}</div>${config ? this.renderContent(config) : nothing}</section>
        ${config ? this.renderControls(config) : nothing}
      </main>`}`;
  }
}

if (!customElements.get("techpanda-smart-rgb-manager")) customElements.define("techpanda-smart-rgb-manager", TechPandaSmartRgbManager);

