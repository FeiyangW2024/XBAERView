import { Style, Fill, Stroke, Text, Circle as CircleStyle } from "ol/style";
import { basemapStack } from "./layerStack";
import type { FeatureLike } from "ol/Feature";
export type BasemapKind =
  "ocean" | "land" | "lakesFill" | "countries" | "coastline" | "provinces" | "rivers" | "lakes" | "cities";
export const themes = {
  light: {
    land: "#e9ece7",
    water: "#cbdde2",
    border: "#adbcb9",
    coast: "#8fa9af",
    river: "#91b7c5",
    text: "#526768",
    halo: "#f3f5ee",
    city: "#58777d",
  },
  dark: {
    land: "#243b43",
    water: "#132b38",
    border: "#3f5860",
    coast: "#54717b",
    river: "#345d70",
    text: "#a5bfc5",
    halo: "#243b43",
    city: "#8babb6",
  },
};
export const rankZoom = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export function visibleAt(
  kind: BasemapKind,
  p: Record<string, unknown>,
  zoom: number,
) {
  if (["ocean", "land", "countries", "coastline"].includes(kind)) return true;
  const base = basemapStack[kind].minZoom;
  const z =
    p.min_zoom != null
      ? Number(p.min_zoom)
      : rankZoom[Math.max(0, Math.min(10, Number(p.scalerank) || 0))]!;
  return zoom >= Math.max(base, z);
}
export function makeBasemapStyle(
  kind: BasemapKind,
  theme: "light" | "dark",
  locale: "zh" | "en",
) {
  const c = themes[theme];
  const cache = new Map<string, Style>();
  return (feature: FeatureLike, resolution: number) => {
    const p = feature.getProperties();
    const zoom = Math.log2(156543.03392804097 / resolution);
    if (!visibleAt(kind, p, zoom)) return undefined;
    const label =
      kind === "cities" && zoom >= Number(p.min_zoom ?? 3)
        ? String(p[`name_${locale}`] || p.name || "")
        : "";
    const weight =
      kind === "rivers"
        ? Math.max(0.4, Math.min(2, Number(p.strokeweig) || 0.6))
        : 1;
    const key = label + "|" + weight;
    if (cache.has(key)) return cache.get(key)!;
    const style = new Style({
      fill:
        kind === "land"
          ? new Fill({ color: c.land })
          : (kind === "ocean" || kind === "lakesFill")
            ? new Fill({ color: c.water })
            : undefined,
      stroke:
        ["cities", "ocean", "land", "lakesFill"].includes(kind)
          ? undefined
          : new Stroke({
              color:
                kind === "rivers"
                  ? c.river
                  : kind === "coastline"
                    ? c.coast
                    : c.border,
              width:
                kind === "provinces" ? 0.55 : kind === "rivers" ? weight : 0.7,
            }),
      image:
        kind === "cities"
          ? new CircleStyle({
              radius: 2.4,
              fill: new Fill({ color: c.city }),
              stroke: new Stroke({ color: c.halo, width: 1 }),
            })
          : undefined,
      text: label
        ? new Text({
            text: label,
            font: '12px "Noto Sans SC", "Noto Sans", sans-serif',
            offsetY: -10,
            fill: new Fill({ color: c.text }),
            stroke: new Stroke({ color: c.halo, width: 3 }),
          })
        : undefined,
    });
    cache.set(key, style);
    return style;
  };
}
