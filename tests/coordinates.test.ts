import {expect,it} from 'vitest';
import {formatCoordinate} from '../src/services/coordinates';
it('formats hemispheres, decimal degrees and DMS with proper carry',()=>{
 expect(formatCoordinate(120.5,false,false)).toBe('120°30′00″ E');
 expect(formatCoordinate(-30.25,true,false)).toBe('30°15′00″ S');
 expect(formatCoordinate(-75.12345,false,true)).toBe('75.1235° W');
 expect(formatCoordinate(12+59/60+59.9/3600,true,false)).toBe('13°00′00″ N');
});
