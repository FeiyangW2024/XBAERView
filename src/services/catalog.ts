import type { RuntimeConfig, LayerInfo, ProductIndex } from "../types";
export let config: RuntimeConfig;
export async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw Error(`${r.status}: ${url}`);
  return r.json();
}
export function dataUrl(path: string) {
  return new URL(path, location.href).href;
}
export async function bootstrap() {
  config = await json<RuntimeConfig>("/config.json");
  if (!config.members || !config.basemapRoot)
    throw Error("Invalid runtime configuration");
  config.rasterCacheSize = Math.max(
    1,
    Math.min(16, config.rasterCacheSize || 4),
  );
  const catalogs = await Promise.all(Object.entries(config.members).map(async ([member, entry]) => {
    const catalogUrl = dataUrl(entry.catalogUrl);
    const c = await json<{ layers: LayerInfo[] }>(catalogUrl);
    if (!Array.isArray(c.layers) || c.layers.some(l => !l.id || !l.index || !l.name?.en || !l.name?.zh || (l.badge !== undefined && typeof l.badge !== "string") || (l.sourceLabel !== undefined && typeof l.sourceLabel !== "string"))) throw Error(`Invalid catalog: ${member}`);
    return c.layers.map(l => ({ ...l, owner: member, index: new URL(l.index, catalogUrl).href }));
  }));
  const c = { layers: catalogs.flat() };
  if (new Set(c.layers.map(l => l.id)).size !== c.layers.length) throw Error('Duplicate layer IDs; publish with --member to namespace products');
  return c.layers;
}
export async function loadIndex(layer: LayerInfo, signal: AbortSignal) {
  const index = await json<ProductIndex>(dataUrl(layer.index), signal);
  if (
    index.id !== layer.id ||
    !Array.isArray(index.files) ||
    index.files.some(
      (f) =>
        !Number.isFinite(Date.parse(f.datetime)) ||
        !f.file ||
        !Array.isArray(f.bounds) ||
        f.bounds.length !== 4,
    )
  )
    throw Error("Invalid product index");
  if (
    index.type === "continuous" &&
    !(
      Number.isFinite(index.min) &&
      Number.isFinite(index.max) &&
      index.max! > index.min!
    )
  )
    throw Error("Invalid range");
  if (index.type === "categorical" && !index.classes)
    throw Error("Missing classes");
  return index;
}
export function rasterUrl(layer: LayerInfo, file: string) {
  return new URL(file, dataUrl(layer.index)).href;
}
