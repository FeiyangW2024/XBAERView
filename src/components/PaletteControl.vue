<script setup lang="ts">
import { ref } from 'vue';
import { useView } from '../stores/view';
import { useCompare } from '../stores/compare';
import { usePalettes } from '../stores/palettes';
import type { LayerSettings } from '../types';
const props=defineProps<{settings:LayerSettings}>();
const s=useView(),c=useCompare(),p=usePalettes(),input=ref<HTMLInputElement>();
const t=(zh:string,en:string)=>s.locale==='zh'?zh:en;
function select(e: Event) {
 const el=e.target as HTMLSelectElement,value=el.value;
 if(value==='__restore') p.restore();
 else if(value==='__upload') input.value?.click();
 else if(value==='__delete') {
  const id=props.settings.palette;
  for(const setting of [...Object.values(s.settings),...c.settings]) if(setting?.palette===id) setting.palette='thermal';
  props.settings.palette='thermal';
  try {p.remove(id);} catch(err){s.error=String(err);}
 } else props.settings.palette=value;
 el.value=props.settings.palette;
}
async function upload(e:Event) {
 const el=e.target as HTMLInputElement,file=el.files?.[0]; if(!file)return;
 try {if(!/\.ya?ml$/i.test(file.name) || file.size>65536) throw Error(t('请选择小于64 KB的 YAML 文件','Select a YAML file under 64 KB'));props.settings.palette=p.add(await file.text(),file.name);}
 catch(err){s.error=String(err);} finally {el.value='';}
}
</script>
<template>
 <div class="palette-control">
  <select :value="settings.palette" @change="select" :aria-label="t('色标','Color scale')">
   <option value="thermal">Thermal</option><option v-if="!p.hidden.includes('viridis')" value="viridis">Viridis</option><option v-if="!p.hidden.includes('custom')" value="custom">{{ t('自定义','Custom') }}</option>
   <option v-for="(entry,id) in p.entries" :key="id" :value="id">{{ entry.name }}</option>
   <option value="__upload">＋ {{ t('上传 YAML 色标…','Import YAML…') }}</option>
   <option value="__delete" :disabled="settings.palette === 'thermal'">− {{ settings.palette === 'thermal' ? t('删除色标（Thermal 为保留默认项）','Delete (Thermal is the default)') : t('删除当前色标','Delete current palette') }}</option>
   <option v-if="p.hidden.length" value="__restore">{{ t('恢复内置色标','Restore built-in palettes') }}</option>
  </select>
  <button class="reverse-palette" :aria-pressed="!!settings.reversed" :aria-label="t('反转色标','Reverse color scale')" :title="t('反转色标','Reverse color scale')" @click="settings.reversed=!settings.reversed">r</button>
  <input ref="input" hidden type="file" accept=".yaml,.yml" @change="upload" />
 </div>
</template>
