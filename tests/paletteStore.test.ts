import {expect,it,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {usePalettes} from '../src/stores/palettes';
import {palettes} from '../src/gis/colors';
it('persists uploaded palettes, reloads them and deletes only custom entries',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 setActivePinia(createPinia());const p=usePalettes();const id=p.add('name: Test\ncolors:\n- "#123456"\n- "#abcdef"','test.yaml');
 expect(palettes[id]).toEqual(['#123456','#abcdef']);
 setActivePinia(createPinia());const restored=usePalettes();expect(restored.entries[id]?.name).toBe('Test');restored.remove(id);expect(palettes[id]).toBeUndefined();expect(JSON.parse(data.get('xbaer-palettes')!)).toEqual({});
 restored.remove('thermal');expect(palettes.thermal).toBeDefined();
 expect(()=>restored.add('invalid','bad.yaml')).toThrow();expect(Object.keys(restored.entries)).toHaveLength(0);vi.unstubAllGlobals();
});
