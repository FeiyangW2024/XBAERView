import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  sources: [] as any[],
  layers: [] as any[],
  releases: [] as string[],
}));
vi.mock("ol/source/GeoTIFF", () => ({
  default: class {
    options: any;
    handlers: Record<string, () => void> = {};
    disposed = false;
    constructor(options: any) {
      this.options = options;
      mocks.sources.push(this);
    }
    on(name: string, fn: () => void) {
      this.handlers[name] = fn;
    }
    getState() {
      return "ready";
    }
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.mock("ol/layer/WebGLTile", () => ({
  default: class {
    disposed = false;
    constructor(_: any) {
      mocks.layers.push(this);
    }
    setOpacity() {}
    setZIndex() {}
    setStyle() {}
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.mock("../src/gis/pixelQuery", () => ({
  PixelReader: class {
    release(url: string) {
      mocks.releases.push(url);
    }
    dispose() {}
    read() {
      return Promise.resolve(1);
    }
  },
}));
import { RasterManager } from "../src/gis/rasters";
import type { ProductIndex } from "../src/types";
beforeEach(() => {
  mocks.sources.length = 0;
  mocks.layers.length = 0;
  mocks.releases.length = 0;
});
describe("raster lifecycle", () => {
  it("aborts old requests and ignores stale tile events on replacement", async () => {
    const map = { addLayer: vi.fn(), removeLayer: vi.fn() },
      status = vi.fn();
    const manager = new RasterManager(map as any, 2, status);
    const index = { type: "continuous" } as ProductIndex;
    const settings = {
      opacity: 1,
      min: 0,
      max: 10,
      palette: "viridis" as const,
    };
    manager.set("a", "http://local/old", index, settings, 20, "EPSG:4326");
    const old = mocks.sources[0];
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, opts: any) => {
        requestSignal = opts.signal;
        return Promise.resolve(new Response());
      }),
    );
    await old.options.sources[0].loader("http://local/old", {}, undefined);
    manager.set("a", "http://local/new", index, settings, 20, "EPSG:4326");
    expect(requestSignal?.aborted).toBe(true);
    expect(old.disposed).toBe(true);
    expect(mocks.releases).toContain("http://local/old");
    status.mockClear();
    old.handlers.tileloadend();
    expect(status).not.toHaveBeenCalled();
    mocks.sources[1].handlers.tileloadend();
    expect(status).toHaveBeenCalledWith("a", "ready");
    manager.retain([]);
    expect(mocks.sources[1].disposed).toBe(true);
    expect(map.removeLayer).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
