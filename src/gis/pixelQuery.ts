import { fromUrl, type GeoTIFF } from "geotiff";
import { transform } from "ol/proj";
/** Bounded TIFF header/block cache; image 0 is always used, never an overview. */
export class PixelReader {
  private cache = new Map<string, GeoTIFF>();
  constructor(private limit: number) {}
  async read(
    url: string,
    coordinate: number[],
    signal: AbortSignal,
    projection?: string,
  ) {
    let tiff = this.cache.get(url);
    if (!tiff) {
      tiff = await fromUrl(
        url,
        { cacheSize: 16, blockSize: 65536, allowFullFile: false },
        signal,
      );
      if (signal.aborted) {
        tiff.close();
        throw new DOMException("Aborted", "AbortError");
      }
      this.cache.set(url, tiff);
      while (this.cache.size > this.limit) {
        const key = this.cache.keys().next().value!;
        this.cache.get(key)?.close();
        this.cache.delete(key);
      }
    } else {
      this.cache.delete(url);
      this.cache.set(url, tiff);
    }
    const image = await tiff.getImage(0);
    const keys = image.getGeoKeys();
    const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
    if (!epsg) throw Error("Missing raster CRS");
    const point = transform(
      coordinate,
      "EPSG:4326",
      projection || `EPSG:${epsg}`,
    );
    const origin = image.getOrigin(),
      res = image.getResolution();
    const x = Math.floor((point[0]! - origin[0]!) / res[0]!),
      y = Math.floor((point[1]! - origin[1]!) / res[1]!);
    if (x < 0 || y < 0 || x >= image.getWidth() || y >= image.getHeight())
      return null;
    const values = await image.readRasters({
      window: [x, y, x + 1, y + 1],
      samples: [0],
      interleave: true,
      signal,
    });
    const value = Number(values[0]);
    return !Number.isFinite(value) || value === image.getGDALNoData()
      ? null
      : value;
  }
  release(url: string) {
    this.cache.get(url)?.close();
    this.cache.delete(url);
  }
  dispose() {
    for (const t of this.cache.values()) t.close();
    this.cache.clear();
  }
}
