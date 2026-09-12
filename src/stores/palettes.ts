import { defineStore } from 'pinia';
import { ref } from 'vue';
import { palettes } from '../gis/colors';
import { parsePaletteYaml } from '../services/paletteFiles';
export const usePalettes = defineStore('palettes', () => {
 const hidden = ref<string[]>([]);
 try {const saved=JSON.parse(localStorage.getItem('xbaer-hidden-palettes') || '[]');if(Array.isArray(saved))hidden.value=saved.filter(id=>['viridis','custom'].includes(id));}catch {}
 const entries = ref<Record<string,{name:string;colors:string[]}>>({});
 try {const saved = JSON.parse(localStorage.getItem('xbaer-palettes') || '{}');for(const [id,v] of Object.entries(saved) as [string,any][]) if(id.startsWith('user-') && typeof v.name === 'string' && Array.isArray(v.colors) && v.colors.length >= 2 && v.colors.length <= 256 && v.colors.every((c:unknown)=>typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c))) entries.value[id] = v;} catch {}
 for(const [id,entry] of Object.entries(entries.value)) palettes[id] = entry.colors;
 function save() {localStorage.setItem('xbaer-palettes',JSON.stringify(entries.value));}
 function add(text: string, filename: string) { const parsed=parsePaletteYaml(text);const id='user-'+(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));entries.value[id]={name:parsed.name || filename.replace(/\.ya?ml$/i,''),colors:parsed.colors};palettes[id]=parsed.colors;save();return id; }
 function remove(id: string) {if(['viridis','custom'].includes(id)){hidden.value=[...new Set([...hidden.value,id])];localStorage.setItem('xbaer-hidden-palettes',JSON.stringify(hidden.value));return;}if(!entries.value[id]) return;delete entries.value[id];delete palettes[id];save();}
 function restore() {hidden.value=[];localStorage.setItem('xbaer-hidden-palettes','[]');}
 return {entries,hidden,add,remove,restore};
});
