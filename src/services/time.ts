import type { ProductIndex } from "../types";
export function unionTimes(
  ids: string[],
  indices: Record<string, ProductIndex>,
) {
  return [
    ...new Set(
      ids.flatMap((id) => indices[id]?.files.map((f) => f.datetime) || []),
    ),
  ].sort();
}
export function exactFile(index: ProductIndex | undefined, time: string) {
  return index?.files.find((f) => f.datetime === time);
}
