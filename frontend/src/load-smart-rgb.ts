/** The lighting editor and its custom wall geometry load only when one of the two pack items is present. */
declare const __FP3D_SMART_RGB_HASH__: string;
let loading: Promise<unknown> | undefined;
export function loadSmartRgb(): Promise<unknown> {
  const url = new URL(`./neonplan3d-smart-rgb.js?v=${__FP3D_SMART_RGB_HASH__}`, new URL(import.meta.url)).href;
  loading ??= import(/* @vite-ignore */ url);
  return loading;
}
