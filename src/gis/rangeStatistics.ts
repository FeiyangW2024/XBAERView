import { fromUrl } from 'geotiff';
import type { RasterFile } from '../types';
export type RangeStatistics = {min:number;p95:number};
const cache=new Map<string,RangeStatistics>();
const bits=new DataView(new ArrayBuffer(4));
function key(value:number) {bits.setFloat32(0,value);const u=bits.getUint32(0);return (u&0x80000000) ? (~u)>>>0 : (u^0x80000000)>>>0;}
function number(k:number) {bits.setUint32(0,(k&0x80000000)?(k^0x80000000)>>>0:(~k)>>>0);return bits.getFloat32(0);}
function binFor(hist:Uint32Array,rank:number) {let before=0;for(let i=0;i<hist.length;i++){if(before+hist[i]!>rank)return {bin:i,rank:rank-before};before+=hist[i]!;}throw Error('Empty statistics');}
/** Exact linear P95 of Float32 COG base pixels, two streaming radix passes.
 * No overview sampling; memory bounded by tile buffer + three 65536-bin histograms.
 */
export async function rangeStatistics(url:string,file:RasterFile,signal:AbortSignal):Promise<RangeStatistics> {
 signal.throwIfAborted();
 if(file.statistics && Number.isFinite(file.statistics.min) && Number.isFinite(file.statistics.p95) && file.statistics.p95>=file.statistics.min) return file.statistics;
 if(cache.has(url))return cache.get(url)!;
 const tiff=await fromUrl(url,{cacheSize:4,blockSize:65536,allowFullFile:false},signal);
 try {
  signal.throwIfAborted();const image=await tiff.getImage(0),width=image.getWidth(),height=image.getHeight();
  const directory=image.getFileDirectory();
  if(directory.SampleFormat?.[0]!==3 || directory.BitsPerSample?.[0]!==32) throw Error('Publish Float32 statistics before displaying this continuous raster');
  const nodata=image.getGDALNoData() ?? file.nodata;
  async function scan(visit:(value:number)=>void) {
   for(let y=0;y<height;y+=512)for(let x=0;x<width;x+=512) {
    signal.throwIfAborted();const values=await image.readRasters({window:[x,y,Math.min(x+512,width),Math.min(y+512,height)],samples:[0],interleave:true,signal});
    for(let i=0;i<values.length;i++){const value=Number(values[i]);if(Number.isFinite(value)&&value!==nodata)visit(value);}
    // Let input events cancel long scans, including when TIFF blocks are cached.
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  let count=0,min=Infinity;const high=new Uint32Array(65536);
  await scan(value=>{min=Math.min(min,value);count++;high[key(value)>>>16]!++;});
  if(!count)throw Error('No valid pixels for P95');
  const rank=(count-1)*.95,lower=binFor(high,Math.floor(rank)),upper=binFor(high,Math.ceil(rank));
  const lowA=new Uint32Array(65536),lowB=new Uint32Array(65536);
  await scan(value=>{const k=key(value),h=k>>>16;if(h===lower.bin)lowA[k&65535]!++;if(h===upper.bin)lowB[k&65535]!++;});
  const a=number(((lower.bin<<16)|binFor(lowA,lower.rank).bin)>>>0),b=number(((upper.bin<<16)|binFor(lowB,upper.rank).bin)>>>0);
  const result={min,p95:a+(b-a)*(rank-Math.floor(rank))};signal.throwIfAborted();cache.set(url,result);while(cache.size>8)cache.delete(cache.keys().next().value!);return result;
 } finally {await tiff.close();}
}
export function applyRange(settings:{min:number;max:number},stats:RangeStatistics) {settings.min=stats.min;settings.max=stats.p95>stats.min ? stats.p95 : stats.min+Math.max(1,Math.abs(stats.min)*1e-6);}
