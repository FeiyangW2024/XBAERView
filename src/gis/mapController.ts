import { registerRasterProjection } from "./projection";
import Map from "ol/Map";
import View from "ol/View";
import { defaults as defaultInteractions } from "ol/interaction/defaults";
import { defaults, ScaleLine } from "ol/control";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj";
import { BasemapManager } from "./basemap";
import { RasterManager } from "./rasters";
import { config, rasterUrl } from "../services/catalog";
import { exactFile } from "../services/time";
import type {
  LayerInfo,
  ProductIndex,
  LayerSettings,
  QueryResult,
} from "../types";
export class MapController {
  readonly map: Map;
  private basemap: BasemapManager;
  private rasters: RasterManager;
  private queryVersion = 0;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private scale = new ScaleLine({ units: "metric", minWidth: 80 });
  private clearHover = () => {};
  private leaveHandler = () => this.clearHover();
  constructor(
    target: HTMLElement,
    onStatus: (id: string, status: string) => void,
    onQuery: (
      coordinate: number[],
      results: QueryResult[],
      loading: boolean,
      pixel: number[],
    ) => void,
    onError: (e: string) => void,
    onCoordinate: (coordinate: number[]) => void = () => {},
  ) {
    this.map = new Map({
      target,
      interactions: defaultInteractions({ onFocusOnly: false }),
      view: new View({
        center: fromLonLat([105, 30]),
        zoom: 4,
        minZoom: 1,
        multiWorld: true,
        maxZoom: 12,
      }),
      controls: defaults({ attribution: false }).extend([
        this.scale,
      ]),
    });
    this.basemap = new BasemapManager(this.map, onError);
    this.rasters = new RasterManager(
      this.map,
      config.rasterCacheSize,
      onStatus,
    );
    this.clearHover = () => {
      clearTimeout(this.hoverTimer);
      this.queryVersion++;
      this.rasters.cancelQuery();
      onQuery([], [], false, []);
    };
    this.map.getViewport().addEventListener("pointerleave", this.leaveHandler);
    this.map.on("movestart", this.clearHover);
    this.map.on("pointermove", (e) => {
      this.clearHover();
      if (!(e.originalEvent.target as HTMLElement)?.closest(".ol-control")) {
        const [lon, lat] = toLonLat(e.coordinate);
        if(Number.isFinite(lon) && Number.isFinite(lat)) onCoordinate([((lon! + 180) % 360 + 360) % 360 - 180, Math.max(-90,Math.min(90,lat!))]);
      }
      if (e.dragging || this.map.getView().getInteracting() || !this.rasters.hasLayers() ||
          (e.originalEvent.target as HTMLElement)?.closest(".ol-control")) return;
      const version = this.queryVersion;
      const coordinate = toLonLat(e.coordinate);
      const pixel = [...e.pixel];
      this.hoverTimer = setTimeout(async () => {
        onQuery(coordinate, [], true, pixel);
        try {
          const results = await this.rasters.query(coordinate);
          if (version === this.queryVersion) onQuery(coordinate, results, false, pixel);
        } catch {
          if (version === this.queryVersion) onQuery([], [], false, []);
        }
      }, 180);
    });
  }
  scaleTarget(expanded: boolean) {
    const target = document.getElementById(expanded ? "time-scale-expanded" : "time-scale-collapsed");
    if (target) { this.scale.setMap(null); this.scale.setTarget(target); this.scale.setMap(this.map); this.map.render(); }
  }

  sync(
    layers: LayerInfo[],
    enabled: string[],
    indices: Record<string, ProductIndex>,
    settings: Record<string, LayerSettings>,
    time: string,
    onStatus: (id: string, status: string) => void,
  ) {
    this.clearHover();
    const active: string[] = [];
    for (const [i, id] of enabled.entries()) {
      const index = indices[id];
      if (!index) continue;
      const file = exactFile(index, time);
      if (!file) {
        onStatus(id, time ? "missing" : "select");
        continue;
      }
      active.push(id);
      this.rasters.set(
        id,
        rasterUrl(
          layers.find((l) => l.id === id)!,
          file.file,
        ),
        index,
        settings[id]!,
        20 + enabled.length - i,
        registerRasterProjection(file),
      );
    }
    this.rasters.retain(active);
  }
  swipe(fraction: number) { this.rasters.fraction = fraction; this.map.render(); }
  compare(layers: LayerInfo[], ids: string[], indices: (ProductIndex | null)[], settings: LayerSettings[], times: string[]) {
    this.clearHover();
    const active: string[] = [];
    ids.forEach((id, side) => {
      const index = indices[side], layer = layers.find(l => l.id === id);
      const file = index && exactFile(index, times[side] ?? '');
      if (!index || !layer || !file || !settings[side]) return;
      const key = 'compare:' + side; active.push(key);
      this.rasters.set(key, rasterUrl(layer,file.file), index, settings[side]!, 20 + side, registerRasterProjection(file));
    });
    this.rasters.retain(active);
  }
  appearance(theme: "light" | "dark", locale: "zh" | "en") {
    this.basemap.appearance(theme, locale);
  }
  imagery(on: boolean) {
    this.basemap.setImagery(on);
  }
  private fitPadding(): number[] {
    const target = this.map.getTargetElement();
    const width = target.clientWidth;
    const height = target.clientHeight;
    const layer = document.getElementById('layer-panel');
    const time = document.getElementById('time-panel');
    const panelWidth = layer?.getClientRects().length ? layer.getBoundingClientRect().width + 36 : 20;
    const bottom = time?.getClientRects().length ? time.getBoundingClientRect().height + 48 : 70;
    return [30, 65, Math.min(bottom, height * .35), width > 640 ? Math.min(panelWidth, width * .4) : 20];
  }
  fit(bounds?: number[]) {
    if (bounds)
      this.map
        .getView()
        .fit(transformExtent(bounds, "EPSG:4326", "EPSG:3857"), {
          padding: this.fitPadding(),
          maxZoom: 7,
          duration: 300,
        });
    else
      this.map
        .getView()
        .animate({ center: fromLonLat([105, 30]), zoom: 4, duration: 300 });
  }
  dispose() {
    this.clearHover();
    this.map.getViewport().removeEventListener("pointerleave", this.leaveHandler);
    this.rasters.dispose();
    this.basemap.dispose();
    this.map.setTarget(undefined);
    this.map.dispose();
  }
}
