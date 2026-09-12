import { expect, it } from 'vitest';
import { layerBadge, layerSourceLabel } from '../src/services/layerLabels';
import type { LayerInfo } from '../src/types';
const layer = (en: string, badge?: string) => ({id:en,name:{zh:'中文名称',en},badge}) as LayerInfo;
it('uses stable variable abbreviations for existing and future products', () => {
 for(const [name,badge] of [['Aerosol type','Ae'],['NO₂ slant column','NO2'],['PM2.5','PM25'],['CO₂','CO2'],['Land surface temperature','LST'],['Land cover classification','LCC'],['Cloud','Cl'],['AOD','AOD'],['Temperature','Te']]) expect(layerBadge(layer(name!))).toBe(badge);
 expect(layerBadge(layer('anything','PM₂.₅'))).toBe('PM25');
 expect(layerBadge(layer('anything','ABCDE'))).toBe('AB');
 expect(layerBadge(layer('anything','Cl'))).toBe('Cl');
 expect(layerBadge({...layer('Aerosol type'),name:{zh:'另一名称',en:'Aerosol type'}})).toBe('Ae');
 expect(layerBadge({} as LayerInfo)).toBe('Var');
});
it('preserves source metadata behavior', () => {
 expect(layerSourceLabel({sourceLabel:'MODIS',source:'Full source'} as LayerInfo)).toBe('MODIS');
 expect(layerSourceLabel({source:'Ground station'} as LayerInfo)).toBe('Ground station');
 expect(layerSourceLabel({} as LayerInfo)).toBe('');
});
