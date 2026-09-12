import Map from "ol/Map";
import GeoTIFF from "ol/source/GeoTIFF";
import WebGLTileLayer from "ol/layer/WebGLTile";
import { rasterStyle } from "./colors";
import { PixelReader } from "./pixelQuery";
import type { ProductIndex, LayerSettings, QueryResult } from "../types";
type Entry = {
  url: string;
  layer: WebGLTileLayer;
  source: GeoTIFF;
  index: ProductIndex;
  settings: LayerSettings;
  projection: string;
  generation: number;
  controller: AbortController;
};
export class RasterManager {
  private entries = new globalThis.Map<string, Entry>();
  private generation = 0;
  private queryController?: AbortController;
  private reader: PixelReader;
  constructor(
    private map: Map,
    limit: number,
    private onStatus: (id: string, status: string) => void,
  ) {
    this.reader = new PixelReader(limit);
  }
  set(
    id: string,
    url: string,
    index: ProductIndex,
    settings: LayerSettings,
    z: number,
    projection: string,
  ) {
    const existing = this.entries.get(id);
    if (existing?.url === url) {
      existing.layer.setOpacity(settings.opacity);
      existing.layer.setZIndex(z);
      existing.layer.setStyle(rasterStyle(index, settings));
      return;
    }
    this.remove(id);
    const generation = ++this.generation;
    const controller = new AbortController();
    const source = new GeoTIFF({
      wrapX: true,
      projection,
      sources: [
        {
          url,
          loader: (requestUrl, headers, signal) =>
            fetch(requestUrl, {
              headers,
              signal: signal
                ? AbortSignal.any([signal, controller.signal])
                : controller.signal,
            }),
        },
      ],
      normalize: false,
      interpolate: false,
      sourceOptions: { allowFullFile: false, cacheSize: 16 },
    });
    const layer = new WebGLTileLayer({
      source,
      style: rasterStyle(index, settings),
      opacity: settings.opacity,
      zIndex: z,
      cacheSize: 64,
    });
    const entry = {
      url,
      layer,
      source,
      index,
      settings,
      projection,
      generation,
      controller,
    };
    this.entries.set(id, entry);
    this.map.addLayer(layer);
    this.onStatus(id, "loading");
    const current = () => this.entries.get(id) === entry;
    source.on("change", () => {
      if (!current()) return;
      if (source.getState() === "error") this.onStatus(id, "error");
    });
    source.on("tileloadend", () => {
      if (current()) this.onStatus(id, "ready");
    });
    source.on("tileloaderror", () => {
      if (current()) this.onStatus(id, "error");
    });
  }
  remove(id: string) {
    const e = this.entries.get(id);
    if (e) {
      e.controller.abort();
      this.queryController?.abort();
      this.map.removeLayer(e.layer);
      e.layer.dispose();
      e.source.dispose();
      this.reader.release(e.url);
      this.entries.delete(id);
    }
  }
  retain(ids: string[]) {
    for (const id of this.entries.keys())
      if (!ids.includes(id)) this.remove(id);
  }
  cancelQuery() { this.queryController?.abort(); }
  hasLayers() { return this.entries.size > 0; }
  async query(coordinate: number[]): Promise<QueryResult[]> {
    this.queryController?.abort();
    const c = new AbortController();
    this.queryController = c;
    return Promise.all(
      [...this.entries].map(async ([id, e]) => {
        try {
          const value = await this.reader.read(
            e.url,
            coordinate,
            c.signal,
            e.projection,
          );
          if (c.signal.aborted) throw new DOMException("Aborted", "AbortError");
          return { id, value };
        } catch (error) {
          if (c.signal.aborted) throw error;
          return { id, value: null, error: String(error) };
        }
      }),
    );
  }
  dispose() {
    this.queryController?.abort();
    for (const id of this.entries.keys()) this.remove(id);
    this.reader.dispose();
  }
}
