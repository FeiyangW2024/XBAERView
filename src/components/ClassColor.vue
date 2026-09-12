<script setup lang="ts">
import { ref,watch } from 'vue';
import { useView } from '../stores/view';
const props=defineProps<{color:string;label:string}>();const emit=defineEmits<{change:[color:string]}>();
const s=useView(),open=ref(false),hex=ref(props.color);
watch(()=>props.color,v=>hex.value=v);
function update(value:string) {hex.value=value;if(/^#[0-9a-f]{6}$/i.test(value))emit('change',value);}
</script>
<template>
 <span class="class-color" @keydown.esc="open=false">
  <button class="color-swatch" :style="{background:color}" :aria-label="(s.locale==='zh'?'修改颜色：':'Edit color: ')+label" :aria-expanded="open" @click="open=!open"></button>
  <span v-if="open" class="color-editor">
   <input type="color" :value="color" :aria-label="label" @input="update(($event.target as HTMLInputElement).value)" />
   <input type="text" :value="hex" maxlength="7" placeholder="#RRGGBB" aria-label="Hex color" :aria-invalid="!/^#[0-9a-f]{6}$/i.test(hex)" @input="update(($event.target as HTMLInputElement).value)" />
   <button @click="open=false" :aria-label="s.locale==='zh'?'关闭颜色编辑':'Close color editor'">×</button>
  </span>
 </span>
</template>
