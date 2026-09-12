export type Locale = "zh" | "en";
export type Localized = { zh: string; en: string };
export type LayerInfo = {
  id: string;
  name: Localized;
  type: "continuous" | "categorical";
  unit: string;
  source: string;
  badge?: string;
  sourceLabel?: string;
  owner: string;
  index: string;
};
export type RasterFile = {
  datetime: string;
  file: string;
  bounds: number[];
  resolution: number[];
  nodata: number;
  projection?: { code: string; definition: string };
};
export type ProductIndex = Omit<LayerInfo, "index"> & {
  min?: number;
  max?: number;
  classes?: Record<string, Localized & { color: string }>;
  files: RasterFile[];
};
export type RuntimeConfig = {
  members: Record<string, { catalogUrl: string }>;
  basemapRoot: string;
  rasterCacheSize: number;
  rgbBasemapUrl: string | null;
};
export type LayerSettings = {
  opacity: number;
  min: number;
  max: number;
  palette: "viridis" | "thermal" | "custom";
};
export type QueryResult = { id: string; value: number | null; error?: string };
