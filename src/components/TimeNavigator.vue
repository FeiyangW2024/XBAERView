<script setup lang="ts">
import { useView } from "../stores/view";
const s = useView();
const t = (zh: string, en: string) => (s.locale === "zh" ? zh : en);
function step(n: number) {
  const index = s.dates.indexOf(s.currentDate);
  const next = s.dates[index + n];
  if (next) s.chooseDate(next);
}
</script>
<template>
  <div v-show="!s.timePanelOpen" class="collapsed-time-scale" id="time-scale-collapsed"></div>
  <button v-if="!s.timePanelOpen" class="time-reopen glass" @click="s.timePanelOpen = true" :aria-expanded="false" aria-controls="time-panel" :aria-label="t('展开时间面板', 'Expand time panel')">
    <span aria-hidden="true">◷</span><span>{{ s.currentTime ? s.currentTime.slice(0,16).replace('T',' ') + ' UTC' : t('观测时间', 'Observation time') }}</span><span aria-hidden="true">⌃</span>
  </button>
  <section v-show="s.timePanelOpen" id="time-panel"
    class="timeline glass"
    :aria-label="t('观测时间', 'Observation time')"
  >
    <div class="time-scale" id="time-scale-expanded"></div>
    <button class="time-collapse collapse-button" @click="s.timePanelOpen = false" :aria-expanded="true" aria-controls="time-panel" :aria-label="t('收起时间面板', 'Collapse time panel')">⌄</button>
    <div class="time-heading">
      <div>
        <span class="eyebrow">OBSERVATION TIME</span>
        <h2>{{ t("观测时间", "Observation time") }} <small>UTC</small></h2>
      </div>
      <div class="date-controls">
        <button
          :disabled="s.dates.indexOf(s.currentDate) <= 0"
          @click="step(-1)"
          :aria-label="t('上一可用日期', 'Previous available date')"
        >
          ‹</button
        ><input
          type="date"
          :aria-label="t('日期', 'Date')"
          :value="s.currentDate"
          :min="s.dates[0]"
          :max="s.dates.at(-1)"
          :disabled="!s.dates.length"
          @change="s.chooseDate(($event.target as HTMLInputElement).value)"
        /><button
          :disabled="
            !s.dates.length ||
            s.dates.indexOf(s.currentDate) >= s.dates.length - 1
          "
          @click="step(1)"
          :aria-label="t('下一可用日期', 'Next available date')"
        >
          ›
        </button>
      </div>
    </div>
    <div v-if="!s.enabled.length" class="time-empty">
      {{
        t(
          "启用一个图层以查看可用观测时间",
          "Enable a layer to view available observations",
        )
      }}
    </div>
    <template v-else
      ><div class="date-strip">
        <button
          v-for="date in s.dates"
          :key="date"
          :class="{ selected: date === s.currentDate }"
          @click="s.chooseDate(date)"
        >
          {{ date.slice(5) }}<i></i>
        </button>
      </div>
      <div class="time-strip">
        <button
          v-for="time in s.dayTimes"
          :key="time"
          :class="{ selected: time === s.currentTime }"
          @click="s.chooseTime(time)"
        >
          <i></i>{{ time.slice(11, 16) }}</button
        ><span v-if="!s.dayTimes.length" class="muted">{{
          t("该日期暂无观测数据", "No observations on this date")
        }}</span
        ><span v-else-if="!s.currentTime" class="time-prompt">{{
          t("选择时刻以显示数据", "Select a time to display data")
        }}</span>
      </div></template
    >
  </section>
</template>
