import { expect, it } from 'vitest';
import Feature from 'ol/Feature';
import { basemapStack, imageryZIndex, scienceZIndex } from '../src/gis/layerStack';
import { makeBasemapStyle, visibleAt } from '../src/gis/basemapStyles';
it('keeps all scientific rasters between base and reference bands regardless of count',()=>{
 for(const count of [1,2,1000]) {
  expect(scienceZIndex(0,count)).toBeLessThan(basemapStack.lakes.zIndex);
  expect(scienceZIndex(count-1,count)).toBeGreaterThan(imageryZIndex);
  if(count>1)expect(scienceZIndex(0,count)).toBeGreaterThan(scienceZIndex(1,count));
 }
 expect(basemapStack.cities.zIndex).toBeGreaterThan(basemapStack.provinces.zIndex);
});
it('separates polygon fills from geographic reference strokes in both themes',()=>{
 for(const theme of ['light','dark'] as const){
  const feature=new Feature({min_zoom:0});
  const style=(kind: keyof typeof basemapStack)=>makeBasemapStyle(kind,theme,'zh')(feature,156543.03392804097/16)!;
  expect(style('land').getFill()).toBeTruthy();expect(style('land').getStroke()).toBeNull();
  for(const kind of ['countries','lakes','coastline','provinces'] as const){expect(style(kind).getFill()).toBeNull();expect(style(kind).getStroke()).toBeTruthy();}
  expect(style('lakesFill').getFill()).toBeTruthy();
 }
});
it('uses exact zoom thresholds and feature ranks for each reference layer',()=>{
 expect(visibleAt('provinces',{min_zoom:0},3.999)).toBe(false);
 expect(visibleAt('provinces',{min_zoom:0},4)).toBe(true);
 expect(visibleAt('rivers',{min_zoom:0},2.999)).toBe(false);
 expect(visibleAt('rivers',{min_zoom:0},3)).toBe(true);
 for(const kind of ['lakes','lakesFill','cities'] as const)expect(visibleAt(kind,{scalerank:5},4)).toBe(false);
});
