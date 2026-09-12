import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ files: [] as any[] }));
vi.mock("geotiff", () => ({
  fromUrl: vi.fn(async () => {
    const file = {
      close: vi.fn(),
      getImage: vi.fn(async (index: number) => ({
        getGeoKeys: () => ({ GeographicTypeGeoKey: 4326 }),
        getOrigin: () => [100, 40],
        getResolution: () => [0.1, -0.1],
        getWidth: () => 20,
        getHeight: () => 20,
        getGDALNoData: () => -9999,
        readRasters: () => Promise.resolve([123.5]),
      })),
    };
    state.files.push(file);
    return file;
  }),
}));
import { PixelReader } from "../src/gis/pixelQuery";
describe("base resolution query cache", () => {
  it("uses image zero, bounds checks, evicts and releases", async () => {
    const reader = new PixelReader(2),
      signal = new AbortController().signal;
    expect(await reader.read("a", [100.5, 39.5], signal)).toBe(123.5);
    expect(state.files[0].getImage).toHaveBeenCalledWith(0);
    expect(await reader.read("a", [90, 39.5], signal)).toBeNull();
    await reader.read("b", [100.5, 39.5], signal);
    await reader.read("c", [100.5, 39.5], signal);
    expect(state.files[0].close).toHaveBeenCalledOnce();
    reader.release("b");
    expect(state.files[1].close).toHaveBeenCalledOnce();
    reader.dispose();
    expect(state.files[2].close).toHaveBeenCalledOnce();
  });
});
