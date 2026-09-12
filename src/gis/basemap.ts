import Map from "ol/Map";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import GeoTIFF from "ol/source/GeoTIFF";
import WebGLTileLayer from "ol/layer/WebGLTile";
import { makeBasemapStyle, themes, type BasemapKind } from "./basemapStyles";
import { config, dataUrl } from "../services/catalog";
export class BasemapManager {
  private layers = new globalThis.Map<BasemapKind, VectorLayer>();
  private controller = new AbortController();
  private rgb?: WebGLTileLayer;
  constructor(
    private map: Map,
    private error: (e: string) => void,
  ) {
    for (const kind of [
      "countries",
      "lakes",
      "rivers",
      "coastline",
      "provinces",
      "cities",
    ] as BasemapKind[]) {
      const source = new VectorSource({ wrapX: true });
      const layer = new VectorLayer({
        source,
        declutter: kind === "cities",
        minZoom:
          kind === "provinces" ? 3.99 : kind === "rivers" ? 2.99 : undefined,
        style: makeBasemapStyle(kind, "light", "zh"),
      });
      this.layers.set(kind, layer);
      map.addLayer(layer);
      this.load(kind, source);
    }
    if (config.rgbBasemapUrl) {
      this.rgb = new WebGLTileLayer({
        source: new GeoTIFF({
          wrapX: true,
          sources: [{ url: dataUrl(config.rgbBasemapUrl) }],
          convertToRGB: true,
        }),
        visible: false,
        zIndex: 0,
      });
      map.addLayer(this.rgb);
    }
  }
  private async load(kind: BasemapKind, source: VectorSource) {
    try {
      const r = await fetch(new URL(kind + ".geojson", dataUrl(config.basemapRoot)).href, {
        signal: this.controller.signal,
      });
      if (!r.ok) throw Error(`${kind}: ${r.status}`);
      const json = await r.json();
      if (!this.controller.signal.aborted)
        source.addFeatures(
          new GeoJSON().readFeatures(json, { featureProjection: "EPSG:3857" }),
        );
    } catch (e) {
      if (!this.controller.signal.aborted) this.error(String(e));
    }
  }
  appearance(theme: "light" | "dark", locale: "zh" | "en") {
    for (const [kind, layer] of this.layers)
      layer.setStyle(makeBasemapStyle(kind, theme, locale));
    this.map.getTargetElement().style.background = themes[theme].water;
  }
  setImagery(visible: boolean) {
    this.rgb?.setVisible(visible);
    this.layers.get("countries")?.setVisible(!visible);
  }
  dispose() {
    this.controller.abort();
    for (const layer of this.layers.values()) {
      layer.getSource()?.clear();
      this.map.removeLayer(layer);
      layer.dispose();
    }
    if (this.rgb) {
      this.rgb.getSource()?.dispose();
      this.rgb.dispose();
    }
  }
}
