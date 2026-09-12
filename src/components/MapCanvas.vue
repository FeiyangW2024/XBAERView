<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { useView } from "../stores/view";
import { rangeStatistics, applyRange } from "../gis/rangeStatistics";
import { rasterUrl } from "../services/catalog";
import { exactFile } from "../services/time";
import { MapController } from "../gis/mapController";
import { useCompare } from "../stores/compare";
const c = useCompare();
const s = useView(),
  target = ref<HTMLElement>();
let controller: MapController | undefined;
const status = (id: string, value: string) => { if(id.startsWith("compare:")) c.status[Number(id.slice(-1))] = value; else s.status[id] = value; };
onMounted(() => {
  controller = new MapController(
    target.value!,
    status,
    (coordinate, results, loading, pixel) =>
      (s.query = coordinate.length ? { coordinate, results, loading, pixel } : null),
    (e) => (s.error = e),
    coordinate => (s.mouseCoordinate = coordinate),
  );
  nextTick(() => controller?.scaleTarget(s.timePanelOpen));
  controller.appearance(s.theme as "light" | "dark", s.locale);
});
watch(
  () => [s.enabled, s.indices, s.currentTime, s.enabled.map(id => s.settings[id]?.manualRange), c.active, c.ids, c.indices, c.times, c.settings.map(v => v.manualRange)],
  (_, __, cleanup) => {
    const abort = new AbortController(); cleanup(() => abort.abort());
    const rows = c.active ? c.ids.map((id,side) => ({id,index:c.indices[side],settings:c.settings[side],time:c.times[side] ?? ''})) : s.enabled.map(id => ({id,index:s.indices[id],settings:s.settings[id],time:s.currentTime}));
    for(const row of rows) if(row.index?.type==='continuous' && row.settings && !row.settings.manualRange) row.settings.rangeStatus='loading';
    void Promise.all(rows.map(async row => {
      if(row.index?.type !== 'continuous' || !row.settings || row.settings.manualRange) return null;
      const file=exactFile(row.index,row.time),layer=s.layers.find(l=>l.id===row.id);if(!file || !layer)return null;
      try {return {row,stats:await rangeStatistics(rasterUrl(layer,file.file),file,abort.signal)};}
      catch(e){if(!abort.signal.aborted){row.settings.rangeStatus='error';s.error=String(e);}return null;}
    })).then(results => {
      if(abort.signal.aborted)return;
      const valid=results.filter(r=>r!==null);
      if(c.active && c.ids[0]===c.ids[1] && valid.length>0 && valid.length!==2) { valid.forEach(({row})=>row.settings!.rangeStatus='error');return; }
      if(c.active && c.ids[0]===c.ids[1] && valid.length===2) {
        const shared={min:Math.min(...valid.map(r=>r.stats.min)),p95:Math.max(...valid.map(r=>r.stats.p95))};
        valid.forEach(({row})=>{if(!row.settings!.manualRange){applyRange(row.settings!,shared);row.settings!.rangeStatus='ready';}});
      } else valid.forEach(({row,stats})=>{if(!row.settings!.manualRange){applyRange(row.settings!,stats);row.settings!.rangeStatus='ready';}});
    });
  }, {deep:true, immediate:true},
);
watch(
  () => [s.enabled, s.indices, s.settings, s.currentTime, c.active, c.ids, c.indices, c.settings, c.times],
  () => {
    s.query = null;
    if(c.active) { controller?.compare(s.layers,c.ids,c.indices.map((index,i) => index?.type === "continuous" && !c.settings[i]?.manualRange && c.settings[i]?.rangeStatus !== "ready" ? null : index),c.settings,c.times); return; }
    controller?.sync(
      s.layers,
      s.enabled.filter(id => s.indices[id]?.type !== "continuous" || s.settings[id]?.manualRange || s.settings[id]?.rangeStatus === "ready"),
      s.indices,
      s.settings,
      s.currentTime,
      status,
    );
  },
  { deep: true },
);
watch(
  () => [s.theme, s.locale],
  () => controller?.appearance(s.theme as "light" | "dark", s.locale),
);
watch(() => s.timePanelOpen, async () => { await nextTick(); controller?.scaleTarget(s.timePanelOpen); });
watch(() => c.fraction, value => controller?.swipe(value));
onBeforeUnmount(() => { c.stop(); controller?.dispose(); });
defineExpose({
  fit: (bounds?: number[]) => controller?.fit(bounds),
  imagery: (on: boolean) => controller?.imagery(on),
});
</script>
<template>
  <div
    ref="target"
    class="map-canvas"
    :aria-label="s.locale === 'zh' ? '科研数据地图' : 'Scientific data map'"
    tabindex="0"
  ></div>
</template>
