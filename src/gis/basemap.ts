import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";
import { basemapStack, imageryZIndex } from "./layerStack";
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
    // Share downloaded geometries, not layer instances: fills and strokes render
    // in separate bands without fetching countries/lakes twice.
    const sources = new globalThis.Map<string, VectorSource>();
    for (const kind of Object.keys(basemapStack) as BasemapKind[]) {
      const dataset = kind === "land" ? "countries" : kind === "lakesFill" ? "lakes" : kind;
      let source = sources.get(dataset);
      const fresh = !source;
      if (!source) { source = new VectorSource({ wrapX: true }); sources.set(dataset, source); }
      if (kind === "ocean") {
        const edge = 20037508.342789244;
        source.addFeature(new Feature(new Polygon([[[-edge,-edge],[edge,-edge],[edge,edge],[-edge,edge],[-edge,-edge]]])));
      }
      const rule = basemapStack[kind];
      const layer = new VectorLayer({
        source,
        properties: { basemapKind: kind },
        zIndex: rule.zIndex,
        declutter: kind === "cities",
        // Exact inclusive zoom thresholds are evaluated by the style function.
        style: makeBasemapStyle(kind, "light", "zh"),
      });
      this.layers.set(kind, layer);
      map.addLayer(layer);
      if (fresh && kind !== "ocean") void this.load(dataset, source);
    }
    if (config.rgbBasemapUrl) {
      this.rgb = new WebGLTileLayer({
        source: new GeoTIFF({
          wrapX: true,
          sources: [{ url: dataUrl(config.rgbBasemapUrl) }],
          convertToRGB: true,
        }),
        visible: false,
        zIndex: imageryZIndex,
      });
      map.addLayer(this.rgb);
    }
  }
  private async load(kind: string, source: VectorSource) {
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
    this.layers.get("land")?.setVisible(!visible);
    this.layers.get("lakesFill")?.setVisible(!visible);
  }
  dispose() {
    this.controller.abort();
    for (const layer of this.layers.values()) {
      layer.getSource()?.clear();
      this.map.removeLayer(layer);
      layer.dispose();
    }
    if (this.rgb) {
      this.map.removeLayer(this.rgb);
      this.rgb.getSource()?.dispose();
      this.rgb.dispose();
    }
  }
}
