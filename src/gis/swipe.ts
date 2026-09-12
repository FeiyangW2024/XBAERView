import type WebGLTileLayer from 'ol/layer/WebGLTile';
/** Dedicated layer canvases allow clipping without affecting the basemap or peer.
 * Clip the final canvas, including WebGL post-processing; no stale pixels on drag.
 */
export function attachSwipe(layer: WebGLTileLayer, side: number, fraction: () => number) {
 layer.on('postrender', event => {
  const canvas = (event.context as WebGLRenderingContext).canvas as HTMLCanvasElement;
  const split = Math.max(0, Math.min(1, fraction())) * 100;
  canvas.style.clipPath = side === 0 ? `inset(0 ${100-split}% 0 0)` : `inset(0 0 0 ${split}%)`;
 });
}
