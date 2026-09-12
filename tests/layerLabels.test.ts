import { expect, it } from 'vitest';
import { layerBadge, layerSourceLabel } from '../src/services/layerLabels';
import type { LayerInfo } from '../src/types';
it('uses metadata for arbitrary products and neutral fallback for old JSON',()=>{
 const layer={type:'continuous',badge:'LST',sourceLabel:'MODIS',source:'MODIS land surface temperature'} as LayerInfo;
 expect(layerBadge(layer)).toBe('LST');expect(layerSourceLabel(layer)).toBe('MODIS');
 const old={type:'continuous',source:'Ground station PM2.5'} as LayerInfo;
 expect(layerBadge(old)).toBe('◒');expect(layerSourceLabel(old)).toBe('Ground station PM2.5');
 expect(layerSourceLabel({type:'categorical'} as LayerInfo)).toBe('');
 expect(layerBadge({type:'categorical'} as LayerInfo)).toBe('▦');
});
