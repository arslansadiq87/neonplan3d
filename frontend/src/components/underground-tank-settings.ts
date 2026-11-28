import { css, html, LitElement } from "lit";
import type { HomeAssistant } from "../types.ts";
import type { Furniture, ModuleData } from "../model.ts";
import { measuredIndicator, readTankWater } from "../underground-inspection.ts";

const PACK_ID = "studio.techpanda.water_tanks";

/** Sensor calibration and read-only capacity/status information for the underground concrete tank. */
export class Fp3dUndergroundTankSettings extends LitElement {
  static properties = {
    furniture: { attribute: false },
    hass: { attribute: false },
    admin: { type: Boolean },
  };
  static styles = css`:host{display:block;margin-top:10px}.fp3d-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fp3d-wide{grid-column:1/-1}.fp3d-sub{font-size:.82em;opacity:.78;margin:4px 0}.fp3d-field{display:grid;gap:4px;font-size:.85em}.fp3d-field input,.fp3d-field select{min-width:0;width:100%}.fp3d-btn{grid-column:1/-1}`;

  declare furniture: Furniture | null;
  declare hass: HomeAssistant | undefined;
  declare admin: boolean;

  constructor() {
    super();
    this.furniture = null;
    this.hass = undefined;
    this.admin = false;
  }

  private updateConfig(patch: Record<string, unknown>): void {
    const f = this.furniture;
    if (!f) return;
    const mods: ModuleData = { ...(f.mods ?? {}), [PACK_ID]: { ...(f.mods?.[PACK_ID] ?? {}), ...patch } };
    this.dispatchEvent(new CustomEvent("tank-settings", { detail: mods, bubbles: true, composed: true }));
  }

  protected render() {
    const f = this.furniture;
    if (!f) return html``;
    const config = f.mods?.[PACK_ID] ?? {};
    const mode = config.waterMode === "depth" || config.waterMode === "volume" ? config.waterMode : "percent";
    const capacity = typeof config.maxCapacityL === "number" && Number.isFinite(config.maxCapacityL) && config.maxCapacityL > 0 ? config.maxCapacityL : f.w * 0.82 * f.d * 0.82 * f.h * 0.72 * 1000;
    const calibrated = typeof config.maxCapacityL === "number" && config.maxCapacityL > 0;
    const reading = readTankWater(f, this.hass?.states ?? {});
    const currentL = reading ? reading.measuredVolumeL ?? reading.fraction * capacity : null;
    const indicator = (slot: string) => {
      if (!f.binds?.[slot]) return "Not configured";
      const state = measuredIndicator(f.binds[slot], this.hass?.states ?? {});
      return state ?? "Unavailable";
    };
    const field = (label: string, value: number, change: (n: number) => void, min = 0.01, step = 0.01) => html`<label class="fp3d-field">${label}<input type="number" min=${min} step=${step} .value=${String(value)} ?disabled=${!this.admin} @change=${(e: Event) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n) && n >= min) change(n); }} /></label>`;
    return html`<details open>
      <summary>Underground tank · calibration and live readings</summary>
      <div class="fp3d-form">
        <p class="fp3d-sub fp3d-wide">Internal fill dimensions: ${(f.d * 0.82).toFixed(2)} × ${(f.w * 0.82).toFixed(2)} × ${(f.h * 0.72).toFixed(2)} m. Wall thickness is 8% of the matching span; base and top slab are 7.5% of tank height.</p>
        <label class="fp3d-field fp3d-wide">Water sensor reports<select .value=${mode} ?disabled=${!this.admin} @change=${(e: Event) => this.updateConfig({ waterMode: (e.target as HTMLSelectElement).value })}><option value="percent">Percentage</option><option value="depth">Measured depth</option><option value="volume">Measured volume</option></select></label>
        ${mode === "depth" ? html`${field("Usable water depth (m)", typeof config.usableDepthM === "number" ? config.usableDepthM : f.h * 0.72, (n) => this.updateConfig({ usableDepthM: n }))}
          <label class="fp3d-field">Depth unit if sensor has no unit<select .value=${String(config.depthUnit ?? "m")} ?disabled=${!this.admin} @change=${(e: Event) => this.updateConfig({ depthUnit: (e.target as HTMLSelectElement).value })}>${["m", "cm", "mm", "ft", "in"].map((unit) => html`<option value=${unit}>${unit}</option>`)}</select></label>` : html``}
        ${mode === "volume" ? html`<label class="fp3d-field">Volume unit if sensor has no unit<select .value=${String(config.volumeUnit ?? "L")} ?disabled=${!this.admin} @change=${(e: Event) => this.updateConfig({ volumeUnit: (e.target as HTMLSelectElement).value })}>${[["L", "Litres"], ["m³", "Cubic metres"], ["gal", "US gallons"], ["ukgal", "Imperial gallons"]].map(([unit, label]) => html`<option value=${unit}>${label}</option>`)}</select></label>` : html``}
        <label class="fp3d-field fp3d-wide">Calibrated maximum capacity (L, optional)<input type="number" min="1" step="10" .value=${calibrated ? String(config.maxCapacityL) : ""} placeholder=${String(Math.round(capacity))} ?disabled=${!this.admin} @change=${(e: Event) => { const raw = (e.target as HTMLInputElement).value; const n = Number(raw); if (!raw) this.updateConfig({ maxCapacityL: null }); else if (Number.isFinite(n) && n > 0) this.updateConfig({ maxCapacityL: n }); }} /></label>
        ${calibrated ? html`<button class="fp3d-btn" ?disabled=${!this.admin} @click=${() => this.updateConfig({ maxCapacityL: null })}>Use geometric estimate</button>` : html``}
        <div class="fp3d-sub fp3d-wide">Maximum capacity: <b>${capacity.toFixed(0)} L</b> · ${calibrated ? "calibrated" : "geometric estimate"}</div>
        ${reading ? html`<div class="fp3d-sub fp3d-wide">Water level: <b>${(reading.fraction * 100).toFixed(1)}%</b> (${reading.source === "percentage" ? "measured percentage" : reading.source === "depth" ? "measured depth" : "calculated from measured volume"})</div>
          <div class="fp3d-sub fp3d-wide">Current volume: <b>${currentL!.toFixed(0)} L</b> (${reading.measuredVolumeL === null ? "estimate" : "measured sensor value"}) · Remaining capacity: <b>${Math.max(0, capacity - currentL!).toFixed(0)} L</b></div>` : html`<div class="fp3d-sub fp3d-wide">Water reading: <b>No valid measurement</b>; live fill is hidden until a bound sensor reports a valid value.</div>`}
        <div class="fp3d-sub fp3d-wide">Pump: ${indicator("pump")} · Low water: ${indicator("low")} · Overflow: ${indicator("overflow")}</div>
        <p class="fp3d-sub fp3d-wide">Status entities are read only. The integration does not operate the pump.</p>
      </div>
    </details>`;
  }
}

if (!customElements.get("fp3d-underground-tank-settings")) customElements.define("fp3d-underground-tank-settings", Fp3dUndergroundTankSettings);
