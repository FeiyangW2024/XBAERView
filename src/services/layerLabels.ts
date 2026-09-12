import type { LayerInfo } from '../types';
export function layerBadge(layer: LayerInfo): string {
  return layer.badge?.trim() || (layer.type === 'continuous' ? '◒' : '▦');
}
export function layerSourceLabel(layer: LayerInfo): string {
  return layer.sourceLabel?.trim() || layer.source?.trim() || '';
}
