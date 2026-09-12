import {expect,it} from 'vitest';
import {parsePaletteYaml} from '../src/services/paletteFiles';
import {paletteColors,rasterStyle,palettes} from '../src/gis/colors';
import type {LayerSettings,ProductIndex} from '../src/types';
it('imports strict YAML sequences and rejects unsafe/invalid color inputs',()=>{
 expect(parsePaletteYaml('name: Ocean\ncolors:\n  - "#0000ff"\n  - "#ffffff" # white')).toEqual({name:'Ocean',colors:['#0000ff','#ffffff']});
 expect(parsePaletteYaml('- "#ffeff3"\n- "#c3b1ff"').colors).toHaveLength(2);
 for(const text of ['- #ff0000\n- #ffffff','- "red"\n- "#ffffff"','!!js/function x','colors: &x\n- "#000000"','- "#000000"'])expect(()=>parsePaletteYaml(text)).toThrow();
});
it('reversal changes renderer and legend colors without mutating palettes',()=>{
 const s:LayerSettings={min:0,max:10,palette:'thermal',opacity:1,reversed:true};const original=[...palettes.thermal!];
 expect(paletteColors(s)).toEqual([...original].reverse());expect(palettes.thermal).toEqual(original);
 const expression=JSON.stringify(rasterStyle({type:'continuous'} as ProductIndex,s));expect(expression.indexOf(original.at(-1)!)).toBeLessThan(expression.indexOf(original[0]!));
});
it('categorical overrides preserve original metadata',()=>{
 const index={type:'categorical',classes:{'1':{color:'#112233'}}} as unknown as ProductIndex;
 const style=rasterStyle(index,{min:0,max:1,opacity:1,palette:'thermal',classColors:{'1':'#abcdef'}});
 expect(JSON.stringify(style)).toContain('#abcdef');expect(index.classes!['1']!.color).toBe('#112233');
});
