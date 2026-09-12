<script setup lang="ts">
import { useCompare } from '../stores/compare';
import { useView } from '../stores/view';
const c = useCompare(), s = useView();
const t = (zh: string,en: string) => s.locale === 'zh' ? zh : en;
function move(e: PointerEvent) { if((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) c.fraction = Math.max(.02,Math.min(.98,e.clientX/window.innerWidth)); }
function down(e: PointerEvent) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);move(e);s.query = null; }
</script>
<template>
 <div v-if="c.active" class="swipe-overlay">
  <div v-for="side in [0,1]" :key="side" class="swipe-label glass" :class="side === 0 ? 'swipe-left' : 'swipe-right'">{{ side === 0 ? t('左','Left') : t('右','Right') }} · {{ c.indices[side]?.name[s.locale] }}<small>{{ c.times[side]?.replace('T',' ').replace('Z','') }} UTC</small></div>
  <div class="swipe-divider" :style="{left: `${c.fraction*100}%`}"><button role="slider" aria-orientation="horizontal" :aria-label="t('拖动卷帘分界线','Move swipe divider')" :aria-valuenow="Math.round(c.fraction*100)" :aria-valuemin="2" :aria-valuemax="98" @pointerdown.prevent="down" @pointermove="move" @keydown.left.prevent="c.fraction = Math.max(.02,c.fraction-.02)" @keydown.right.prevent="c.fraction = Math.min(.98,c.fraction+.02)" @keydown.home.prevent="c.fraction=.02" @keydown.end.prevent="c.fraction=.98">↔</button></div>
 </div>
</template>
