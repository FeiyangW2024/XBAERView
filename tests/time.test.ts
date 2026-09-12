import { describe, it, expect } from "vitest";
import { unionTimes, exactFile } from "../src/services/time";
import { visibleAt } from "../src/gis/basemapStyles";
import type { ProductIndex } from "../src/types";
const index = (times: string[]) =>
  ({
    files: times.map((datetime) => ({ datetime, file: datetime + ".tif" })),
  }) as ProductIndex;
describe("discrete observation times", () => {
  it("unions enabled layers only and never selects nearest", () => {
    const a = index(["2023-01-06T03:45:00Z", "2023-01-06T04:45:00Z"]),
      b = index(["2023-04-12T03:45:00Z"]);
    expect(unionTimes(["a"], { a, b })).toHaveLength(2);
    expect(unionTimes(["a", "b"], { a, b })).toHaveLength(3);
    expect(exactFile(a, "2023-01-06T04:00:00Z")).toBeUndefined();
    expect(exactFile(b, "2023-01-06T03:45:00Z")).toBeUndefined();
    expect(exactFile(a, "2023-01-06T03:45:00Z")).toBeDefined();
  });
});
describe("Natural Earth visibility", () => {
  it("keeps country/coastline and respects minimum zoom/rank", () => {
    expect(visibleAt("countries", { min_zoom: 9 }, 2)).toBe(true);
    expect(visibleAt("coastline", {}, 2)).toBe(true);
    expect(visibleAt("provinces", { min_zoom: 0 }, 3)).toBe(false);
    expect(visibleAt("provinces", { min_zoom: 0 }, 4)).toBe(true);
    expect(visibleAt("cities", { min_zoom: 6 }, 5)).toBe(false);
    expect(visibleAt("rivers", { scalerank: 5 }, 4)).toBe(false);
    expect(visibleAt("rivers", { scalerank: 5 }, 5)).toBe(true);
  });
});
