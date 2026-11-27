import assert from "node:assert/strict";
import test from "node:test";
import { callSmartRgbEntity, setSmartRgbHelper, setSmartRgbPattern } from "./smart-rgb-services.ts";
import type { HomeAssistant } from "./types.ts";

test("smart RGB controls call only Home Assistant services on configured entities", async () => {
  const calls: { domain: string; service: string; data: Record<string, unknown> }[] = [];
  const hass = { states: { "light.hex_led": {}, "input_select.hex_led_pattern": {}, "input_number.hex_led_speed": {}, "input_text.hex_led_color": {} }, callService: async (domain: string, service: string, data: Record<string, unknown>) => { calls.push({ domain, service, data }); } } as unknown as HomeAssistant;
  await callSmartRgbEntity(hass, "light.hex_led", "turn_on", { brightness: 190 });
  await setSmartRgbPattern(hass, "input_select.hex_led_pattern", "rainbow_glitter");
  await setSmartRgbHelper(hass, "input_number.hex_led_speed", 70);
  await setSmartRgbHelper(hass, "input_text.hex_led_color", "#12ABEF");
  assert.deepEqual(calls, [
    { domain: "light", service: "turn_on", data: { entity_id: "light.hex_led", brightness: 190 } },
    { domain: "input_select", service: "select_option", data: { entity_id: "input_select.hex_led_pattern", option: "rainbow_glitter" } },
    { domain: "input_number", service: "set_value", data: { entity_id: "input_number.hex_led_speed", value: 70 } },
    { domain: "input_text", service: "set_value", data: { entity_id: "input_text.hex_led_color", value: "#12ABEF" } },
  ]);
  assert.equal(callSmartRgbEntity(hass, "light.unavailable", "turn_on"), undefined);
  assert.equal(setSmartRgbPattern(hass, "sensor.hex_led_status_raw", "solid"), undefined);
});
