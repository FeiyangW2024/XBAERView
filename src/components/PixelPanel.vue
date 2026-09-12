<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { useView } from "../stores/view";
const s = useView();
const t = (zh: string, en: string) => (s.locale === "zh" ? zh : en);
function value(id: string, n: number | null) {
  if (n === null) return t("无有效数据", "No valid data");
  const index = s.indices[id];
  if (index?.type === "categorical")
    return index.classes?.[String(n)]?.[s.locale] || String(n);
  return Math.abs(n) >= 1e5 ? n.toExponential(4) : n.toPrecision(5);
}
const panel = ref<HTMLElement>();
const position = ref({ left: '0px', top: '0px' });
async function place() {
  await nextTick();
  if (!s.query || !panel.value) return;
  const [x = 0, y = 0] = s.query.pixel;
  const { width, height } = panel.value.getBoundingClientRect();
  const left = x + 18 + width < window.innerWidth - 10 ? x + 18 : x - width - 18;
  const top = y + 18 + height < window.innerHeight - 10 ? y + 18 : y - height - 18;
  position.value = { left: Math.max(10, left) + 'px', top: Math.max(10, top) + 'px' };
}
watch(() => s.query, place, { deep: true });
window.addEventListener('resize', place);
onBeforeUnmount(() => window.removeEventListener('resize', place));
</script>
<template>
  <section v-if="s.query" ref="panel" class="pixel-panel hover-tooltip glass" :style="position" role="tooltip">
    <h2>{{ t("像元查询", "Pixel inspection") }}</h2>
    <div class="coordinates">
      <span>{{ s.query.coordinate[0]!.toFixed(4) }}° <small>LON</small></span
      ><span>{{ s.query.coordinate[1]!.toFixed(4) }}° <small>LAT</small></span>
    </div>
    <p v-if="s.query.loading">
      {{ t("读取基础分辨率像元…", "Reading native-resolution pixel…") }}
    </p>
    <p v-else-if="!s.query.results.length">
      {{ t("请先显示一个数据图层", "Display a data layer first") }}
    </p>
    <div v-for="r in s.query.results" :key="r.id" class="pixel-result">
      <span>{{ s.indices[r.id]?.name[s.locale] }}</span
      ><strong>{{
        r.error
          ? t("查询失败，请重试", "Query failed; retry")
          : value(r.id, r.value)
      }}</strong
      ><small v-if="r.value !== null">{{ s.indices[r.id]?.unit }}</small>
    </div>
    <footer>
      {{
        t("COG 基础分辨率 · 最近邻像元", "COG base resolution · nearest pixel")
      }}
    </footer>
  </section>
</template>
