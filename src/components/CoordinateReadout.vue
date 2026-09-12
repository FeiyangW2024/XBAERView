<script setup lang="ts">
import { useView } from '../stores/view';
import { formatCoordinate } from '../services/coordinates';
const s=useView();
</script>
<template>
 <button class="coordinate-readout" @click="s.coordinateDecimal=!s.coordinateDecimal" :aria-label="s.locale==='zh'?'切换经纬度格式：度分秒或十进制度':'Toggle coordinates: DMS or decimal degrees'" :title="s.locale==='zh'?'点击切换度分秒 / 十进制度':'Click to toggle DMS / decimal degrees'">
  <template v-if="s.mouseCoordinate">{{ formatCoordinate(s.mouseCoordinate[0]!,false,s.coordinateDecimal) }}<span> · </span>{{ formatCoordinate(s.mouseCoordinate[1]!,true,s.coordinateDecimal) }}</template>
  <template v-else>—°—′—″ E · —°—′—″ N</template>
 </button>
</template>
