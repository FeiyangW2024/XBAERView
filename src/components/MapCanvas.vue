<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { useView } from "../stores/view";
import { MapController } from "../gis/mapController";
const s = useView(),
  target = ref<HTMLElement>();
let controller: MapController | undefined;
const status = (id: string, value: string) => (s.status[id] = value);
onMounted(() => {
  controller = new MapController(
    target.value!,
    status,
    (coordinate, results, loading, pixel) =>
      (s.query = coordinate.length ? { coordinate, results, loading, pixel } : null),
    (e) => (s.error = e),
  );
  nextTick(() => controller?.scaleTarget(s.timePanelOpen));
  controller.appearance(s.theme as "light" | "dark", s.locale);
});
watch(
  () => [s.enabled, s.indices, s.settings, s.currentTime],
  () => {
    s.query = null;
    controller?.sync(
      s.layers,
      s.enabled,
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
onBeforeUnmount(() => controller?.dispose());
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
