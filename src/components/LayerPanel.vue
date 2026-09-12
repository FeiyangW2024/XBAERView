<script setup lang="ts">
import { computed } from "vue";
import { useView } from "../stores/view";
import { layerBadge, layerSourceLabel } from "../services/layerLabels";
import { palettes } from "../gis/colors";
const s = useView();
const t = (zh: string, en: string) => (s.locale === "zh" ? zh : en);
defineEmits<{ fit: [bounds?: number[]] }>();
const ordered = computed(() =>
  [...s.layers].sort((a, b) => {
    const i = s.enabled.indexOf(a.id),
      j = s.enabled.indexOf(b.id);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  }),
);
const statuses: Record<string, [string, string]> = {
  index: ["读取时间索引", "Loading time index"],
  select: ["请选择观测时间", "Select an observation time"],
  missing: ["该时刻无数据", "No data at this time"],
  loading: ["正在读取栅格", "Loading raster"],
  ready: ["已显示", "Visible"],
  error: ["加载失败，可关闭后重试", "Load failed; toggle to retry"],
};
const fmt = (n: number) =>
  Math.abs(n) >= 1e5 ? n.toExponential(1) : Number(n.toPrecision(3)).toString();
function range(id: string, key: "min" | "max", event: Event) {
  const val = Number((event.target as HTMLInputElement).value),
    v = s.settings[id]!;
  if (Number.isFinite(val) && (key === "min" ? val < v.max : val > v.min))
    v[key] = val;
  else (event.target as HTMLInputElement).value = String(v[key]);
}
</script>
<template>
  <button v-if="!s.panelOpen" class="panel-reopen glass" @click="s.panelOpen = true" :aria-label="t('展开图层面板', 'Expand layers panel')" :aria-expanded="false" aria-controls="layer-panel">
    <img src="/favicon.svg" alt="" /><span>XBAER View</span><span aria-hidden="true">☷</span>
  </button>
  <aside v-show="s.panelOpen" id="layer-panel" class="layer-panel glass">
    <header class="panel-brand-header">
      <div class="brand"><img src="/favicon.svg" alt="" /><h1>XBAER <span>View</span></h1></div>
      <button class="collapse-button" @click="s.panelOpen = false" :aria-label="t('收起图层面板', 'Collapse layers panel')" :aria-expanded="true" aria-controls="layer-panel">⌃</button>
    </header>
    <div class="panel-preferences">
      <button class="icon-button" :aria-label="t('切换主题', 'Toggle theme')" @click="s.theme = s.theme === 'light' ? 'dark' : 'light'">{{ s.theme === 'light' ? '◐' : '☀' }}</button>
      <button class="language-button" :aria-label="t('切换为英文', 'Switch to Chinese')" @click="s.locale = s.locale === 'zh' ? 'en' : 'zh'">{{ s.locale === 'zh' ? 'EN' : '中文' }}</button>
    </div>
    <div class="panel-heading">
      <div>
        <span class="eyebrow">WORKSPACE</span>
        <h2>{{ t("数据图层", "Data layers") }}</h2>
      </div>
      <span class="count">{{ s.enabled.length }} / {{ s.layers.length }}</span>
    </div>
    <div class="panel-scroll">
      <p class="panel-hint">
        {{
          t(
            "选择图层，探索观测数据。",
            "Select a layer to explore observations.",
          )
        }}
      </p>
      <article
        v-for="layer in ordered"
        :key="layer.id"
        class="layer-card"
        :class="{ active: s.enabled.includes(layer.id) }"
      >
        <div class="layer-title">
          <span class="product-mark" :class="layer.type">{{
            layerBadge(layer)
          }}</span>
          <div>
            <span v-if="layerSourceLabel(layer)" class="source-label" :title="layerSourceLabel(layer)">{{ layerSourceLabel(layer) }}</span>
            <h3>{{ layer.name[s.locale] }}</h3>
          </div>
          <input
            class="switch"
            type="checkbox"
            :aria-label="layer.name[s.locale]"
            :checked="s.enabled.includes(layer.id)"
            @change="s.toggle(layer.id)"
          />
        </div>
        <div class="layer-meta">
          <span>{{
            layer.type === "continuous"
              ? t("连续变量", "Continuous")
              : t("分类变量", "Categorical")
          }}</span
          ><span>{{ layer.owner }}</span>
        </div>
        <template v-if="s.enabled.includes(layer.id)"
          ><div class="layer-status" :class="s.status[layer.id]">
            {{
              statuses[s.status[layer.id] || "select"]?.[
                s.locale === "zh" ? 0 : 1
              ]
            }}
          </div>
          <template v-if="s.indices[layer.id] && s.settings[layer.id]"
            ><div class="setting-row">
              <label :for="'opacity-' + layer.id">{{
                t("不透明度", "Opacity")
              }}</label
              ><span
                >{{ Math.round(s.settings[layer.id]!.opacity * 100) }}%</span
              >
            </div>
            <input
              :id="'opacity-' + layer.id"
              class="slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              v-model.number="s.settings[layer.id]!.opacity"
            />
            <template v-if="layer.type === 'continuous'"
              ><div class="setting-row">
                <label :for="'palette-' + layer.id">{{
                  t("色标", "Color scale")
                }}</label
                ><select
                  :id="'palette-' + layer.id"
                  v-model="s.settings[layer.id]!.palette"
                >
                  <option value="viridis">Viridis</option>
                  <option value="thermal">Thermal</option>
                  <option value="custom">{{ t("自定义", "Custom") }}</option>
                </select>
              </div>
              <div
                class="gradient"
                :style="{
                  background: `linear-gradient(90deg,${palettes[s.settings[layer.id]!.palette].join(',')})`,
                }"
              ></div>
              <div class="range-labels">
                <span>{{ fmt(s.settings[layer.id]!.min) }}</span
                ><span>{{ fmt(s.settings[layer.id]!.max) }}</span>
              </div>
              <span class="unit">{{ layer.unit }}</span>
              <details>
                <summary>{{ t("调整范围", "Adjust range") }}</summary>
                <div class="range-inputs">
                  <label
                    >Min<input
                      type="number"
                      :value="s.settings[layer.id]!.min"
                      @change="range(layer.id, 'min', $event)" /></label
                  ><label
                    >Max<input
                      type="number"
                      :value="s.settings[layer.id]!.max"
                      @change="range(layer.id, 'max', $event)"
                  /></label>
                </div></details
            ></template>
            <ul v-else class="legend">
              <li
                v-for="(item, key) in s.indices[layer.id]!.classes"
                :key="key"
              >
                <i :style="{ background: item.color }"></i
                ><span>{{ item[s.locale] }}</span
                ><small>{{ key }}</small>
              </li>
            </ul>
            <div class="card-actions">
              <button
                @click="$emit('fit', s.indices[layer.id]!.files[0]?.bounds)"
              >
                {{ t("定位数据", "Fit extent") }} ↗
              </button>
              <div>
                <button
                  :disabled="s.enabled.indexOf(layer.id) === 0"
                  :aria-label="t('上移图层', 'Move layer up')"
                  @click="s.move(layer.id, -1)"
                >
                  ↑</button
                ><button
                  :disabled="
                    s.enabled.indexOf(layer.id) === s.enabled.length - 1
                  "
                  :aria-label="t('下移图层', 'Move layer down')"
                  @click="s.move(layer.id, 1)"
                >
                  ↓
                </button>
              </div>
            </div>
            <p class="source-note">{{ layer.source }}</p>
          </template></template
        >
      </article>
      <div class="panel-note">
        <span class="orbit-small">◎</span>
        <p>
          {{ t("保留科学数值", "Scientific values preserved")
          }}<small>{{
            t("按观测时刻加载 · UTC", "Loaded by observation · UTC")
          }}</small>
        </p>
      </div>
    </div>
    <div class="panel-footer">XBAER <span>EARTH OBSERVATION</span></div>
  </aside>
</template>
