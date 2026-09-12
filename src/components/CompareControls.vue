<script setup lang="ts">
import { useCompare } from '../stores/compare';
import { useView } from '../stores/view';
import { paletteColors } from '../gis/colors';
const c = useCompare(), s = useView();
const t = (zh: string,en: string) => s.locale === 'zh' ? zh : en;
const stamp = (time: string) => time.replace('T',' ').replace('Z','');
</script>
<template>
 <div class="compare-heading"><h2>{{ t('卷帘对比','Swipe comparison') }} <small>UTC</small></h2><div><button @click="c.swap()" :disabled="c.status.includes('loading')">⇄ {{ t('交换','Swap') }}</button><button @click="c.stop()">{{ t('退出','Exit') }}</button></div></div>
 <div class="compare-sides">
  <div v-for="side in [0,1]" :key="side" class="compare-side">
   <label>{{ side === 0 ? t('左侧图层','Left layer') : t('右侧图层','Right layer') }}
    <select :value="c.ids[side]" @change="c.select(side,($event.target as HTMLSelectElement).value)"><option v-for="layer in s.layers" :value="layer.id" :key="layer.id">{{ layer.name[s.locale] }}</option></select>
   </label>
   <label v-if="!c.linked || side === 0">{{ c.linked ? t('共同观测时间','Shared observation time') : t('观测时间','Observation time') }}
    <select :value="c.times[side]" @change="c.time(side,($event.target as HTMLSelectElement).value)" :disabled="!(c.linked ? c.common : c.available[side])?.length"><option value="" disabled>{{ t('暂无可用时刻','No available time') }}</option><option v-for="time in c.linked ? c.common : c.available[side]" :key="time" :value="time">{{ stamp(time) }}</option></select>
   </label>
   <p v-else class="muted">{{ stamp(c.times[side] || '') }} UTC</p>
   <template v-if="c.indices[side] && c.settings[side]">
    <template v-if="c.indices[side]!.type === 'continuous'"><div class="gradient" :style="{background:`linear-gradient(90deg,${paletteColors(c.settings[side]!).join(',')})`}"></div><div class="range-labels"><span>{{ c.settings[side]!.min.toPrecision(3) }}</span><span>{{ c.indices[side]!.unit }}</span><span>{{ c.settings[side]!.max.toPrecision(3) }}</span></div></template>
    <ul v-else class="legend"><li v-for="(item,key) in c.indices[side]!.classes" :key="key"><i :style="{background:c.settings[side]?.classColors?.[String(key)] ?? item.color}"></i>{{ item[s.locale] }}</li></ul>
   </template>
   <small role="status">{{ c.status[side] === 'error' ? t('加载失败，重新选择图层可重试','Load failed; reselect to retry') : c.status[side] === 'loading' ? t('正在加载…','Loading…') : '' }}</small>
  </div>
 </div>
 <label class="compare-sync"><input type="checkbox" :checked="c.linked" @change="c.link(($event.target as HTMLInputElement).checked)" />{{ t('时间同步（精确匹配）','Sync time (exact match)') }}</label>
 <p v-if="c.linked && !c.common.length && c.indices.every(Boolean)" role="status">{{ t('没有共同观测时刻，请关闭时间同步后分别选择。','No shared observation times. Disable sync to select independently.') }}</p>
</template>
