/** Load the downstream infrastructure manager only when a user opens it. */
declare const __FP3D_INFRASTRUCTURE_HASH__: string;

let loading: Promise<unknown> | undefined;

export function loadInfrastructureManager(): Promise<unknown> {
  const url = new URL(`./neonplan3d-infrastructure.js?v=${__FP3D_INFRASTRUCTURE_HASH__}`, new URL(import.meta.url)).href;
  loading ??= import(/* @vite-ignore */ url);
  return loading;
}
