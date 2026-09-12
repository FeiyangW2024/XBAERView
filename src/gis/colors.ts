import type { ProductIndex, LayerSettings } from "../types";
import type { Style } from "ol/layer/WebGLTile";
export const palettes = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  custom: ["#ffeff3", "#c3b1ff", "#6ffdca", "#f4f226", "#b10900"],
  thermal: ["#243a87", "#4e96bc", "#e2d6a6", "#e8904e", "#af3440"],
};
export function rasterStyle(index: ProductIndex, s: LayerSettings): Style {
  if (index.type === "categorical") {
    const expression: unknown[] = ["match", ["band", 1]];
    for (const [value, c] of Object.entries(index.classes!))
      expression.push(Number(value), c.color);
    expression.push("rgba(0,0,0,0)");
    return { color: expression as Style["color"] };
  }
  const colors = palettes[s.palette];
  const expression: unknown[] = ["interpolate", ["linear"], ["band", 1]];
  colors.forEach((c, i) =>
    expression.push(s.min + ((s.max - s.min) * i) / (colors.length - 1), c),
  );
  return {
    color: [
      "case",
      ["==", ["band", 2], 0],
      "rgba(0,0,0,0)",
      expression,
    ] as Style["color"],
  };
}
