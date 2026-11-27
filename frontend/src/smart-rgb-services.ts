import type { HomeAssistant } from "./types.ts";

/** Route fixture controls through registered Home Assistant entities. No controller URL is used by the browser. */
export function callSmartRgbEntity(hass: HomeAssistant | undefined, entity: string | undefined, service: string, data: Record<string, unknown> = {}): Promise<unknown> | undefined {
  if (!hass || !entity || !hass.states[entity]) return undefined;
  const domain = entity.split(".")[0];
  if (domain === "light") return hass.callService(domain, service, { entity_id: entity, ...data });
  if (domain === "select" || domain === "input_select") return hass.callService(domain, service, { entity_id: entity, ...data });
  if (domain === "number" || domain === "input_number" || domain === "input_text") return hass.callService(domain, service, { entity_id: entity, ...data });
  return undefined;
}

export function setSmartRgbPattern(hass: HomeAssistant | undefined, entity: string | undefined, value: string): Promise<unknown> | undefined {
  if (!entity) return undefined;
  const domain = entity.split(".")[0];
  return domain === "light"
    ? callSmartRgbEntity(hass, entity, "turn_on", { effect: value })
    : domain === "select" || domain === "input_select"
      ? callSmartRgbEntity(hass, entity, "select_option", { option: value })
      : undefined;
}

export function setSmartRgbHelper(hass: HomeAssistant | undefined, entity: string | undefined, value: string | number): Promise<unknown> | undefined {
  if (!entity) return undefined;
  const domain = entity.split(".")[0];
  if (domain === "input_text") return callSmartRgbEntity(hass, entity, "set_value", { value: String(value) });
  if (domain === "input_number" || domain === "number") return callSmartRgbEntity(hass, entity, "set_value", { value: Number(value) });
  return undefined;
}
