import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { get } from "ol/proj";
import type { RasterFile } from "../types";
export function registerRasterProjection(file: RasterFile) {
  const code = file.projection?.code || "EPSG:4326";
  if (!get(code)) {
    if (!file.projection?.definition)
      throw Error(`Missing offline projection: ${code}`);
    proj4.defs(code, file.projection.definition);
    register(proj4);
  }
  return code;
}
