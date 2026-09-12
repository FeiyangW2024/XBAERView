import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({values:new Float32Array(),close:vi.fn(),read:vi.fn()}));
vi.mock('geotiff',()=>({fromUrl:vi.fn(async()=>({getImage:async()=>({getWidth:()=>mock.values.length,getHeight:()=>1,getFileDirectory:()=>({SampleFormat:[3],BitsPerSample:[32]}),getGDALNoData:()=>-9999,readRasters:mock.read}),close:mock.close}))}));
import {rangeStatistics} from '../src/gis/rangeStatistics';
import type {RasterFile} from '../src/types';
it('computes exact min and interpolated P95, omitting NoData and nonfinite pixels',async()=>{
 mock.values=new Float32Array([-9999,NaN,Infinity,...Array.from({length:100},(_,i)=>i-50)]);mock.read.mockImplementation(async()=>mock.values);
 const result=await rangeStatistics('unique-range-test',{} as RasterFile,new AbortController().signal);
 expect(result.min).toBe(-50);expect(result.p95).toBeCloseTo(44.05);expect(mock.close).toHaveBeenCalled();expect(mock.read).toHaveBeenCalledTimes(2);
});
it('uses published statistics without raster requests and respects cancellation',async()=>{
 const file={statistics:{min:-4,p95:20}} as RasterFile;
 expect(await rangeStatistics('metadata',file,new AbortController().signal)).toEqual(file.statistics);
 const c=new AbortController();c.abort();await expect(rangeStatistics('abort',file,c.signal)).rejects.toThrow();
});
