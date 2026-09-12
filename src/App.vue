<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useView } from "./stores/view";
import { config } from "./services/catalog";
import MapCanvas from "./components/MapCanvas.vue";
import LayerPanel from "./components/LayerPanel.vue";
import TimeNavigator from "./components/TimeNavigator.vue";
import PixelPanel from "./components/PixelPanel.vue";
const s = useView(),
  map = ref<InstanceType<typeof MapCanvas>>(),
  imagery = ref(false);
const t = (zh: string, en: string) => (s.locale === "zh" ? zh : en);
onMounted(() => s.init());
watch(
  () => [s.theme, s.locale],
  () => {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.lang = s.locale === "zh" ? "zh-CN" : "en";
    localStorage.setItem("theme", s.theme);
    localStorage.setItem("locale", s.locale);
  },
  { immediate: true },
);
</script>
<template>
  <main :class="{ 'layers-collapsed': !s.panelOpen, 'time-collapsed': !s.timePanelOpen }">
    <MapCanvas v-if="s.ready" ref="map" />
    <div v-else class="startup">
      XBAER View<span>{{ t("正在准备工作区…", "Preparing workspace…") }}</span>
    </div>
    <LayerPanel @fit="map?.fit($event)" />
    <button v-if="s.ready && config.rgbBasemapUrl" class="rgb-toggle glass" @click="imagery = !imagery; map?.imagery(imagery)" :aria-pressed="imagery">RGB</button>
    <PixelPanel /><TimeNavigator />
    <div class="attribution">
      Natural Earth · {{ t("离线地理底图", "Offline basemap") }} / EPSG:3857
    </div>
    <div v-if="s.error" role="alert" class="error-toast glass">
      <span>{{ t("数据读取异常", "Data loading error") }}: {{ s.error }}</span
      ><button @click="s.error = ''" :aria-label="t('关闭提示', 'Dismiss')">
        ×
      </button>
    </div>
  </main>
</template>
