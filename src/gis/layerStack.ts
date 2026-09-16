/** Reserved rendering bands: base < science < references < labels. */
export const basemapStack = {
 ocean: { zIndex: 0, minZoom: 0 },
 land: { zIndex: 10, minZoom: 0 },
 lakesFill: { zIndex: 11, minZoom: 0 },
 lakes: { zIndex: 300, minZoom: 0 },
 rivers: { zIndex: 310, minZoom: 3 },
 coastline: { zIndex: 320, minZoom: 0 },
 countries: { zIndex: 330, minZoom: 0 },
 provinces: { zIndex: 340, minZoom: 4 },
 cities: { zIndex: 400, minZoom: 0 },
} as const;
export const imageryZIndex = 20;
/** First listed raster is uppermost; any number stays within (100,200). */
export function scienceZIndex(position: number, count: number) {
 return 100 + (count - position) / (count + 1) * 100;
}
