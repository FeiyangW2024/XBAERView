import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  LayerInfo,
  ProductIndex,
  LayerSettings,
  Locale,
  QueryResult,
} from "../types";
import { bootstrap, loadIndex } from "../services/catalog";
import { unionTimes } from "../services/time";
export const useView = defineStore("view", () => {
  const locale = ref<Locale>(
    (localStorage.getItem("locale") as Locale) === "en" ? "en" : "zh",
  );
  const theme = ref(
    localStorage.getItem("theme") === "dark" ? "dark" : "light",
  );
  const layers = ref<LayerInfo[]>([]),
    enabled = ref<string[]>([]),
    indices = ref<Record<string, ProductIndex>>({}),
    settings = ref<Record<string, LayerSettings>>({}),
    status = ref<Record<string, string>>({});
  const currentTime = ref(""),
    currentDate = ref(""),
    error = ref(""),
    ready = ref(false),
    panelOpen = ref(true),
    timePanelOpen = ref(true),
    query = ref<{
      coordinate: number[];
      pixel: number[];
      results: QueryResult[];
      loading: boolean;
    } | null>(null);
  const controllers = new Map<string, AbortController>();
  const times = computed(() => unionTimes(enabled.value, indices.value));
  const dates = computed(() => [
    ...new Set(times.value.map((t) => t.slice(0, 10))),
  ]);
  const dayTimes = computed(() =>
    times.value.filter((t) => t.startsWith(currentDate.value)),
  );
  async function init() {
    try {
      layers.value = await bootstrap();
      ready.value = true;
    } catch (e) {
      error.value = String(e);
    }
  }
  async function toggle(id: string) {
    if (enabled.value.includes(id)) {
      enabled.value = enabled.value.filter((x) => x !== id);
      controllers.get(id)?.abort();
      controllers.delete(id);
      delete indices.value[id];
      delete status.value[id];
      return;
    }
    enabled.value.push(id);
    status.value[id] = "index";
    const c = new AbortController();
    controllers.set(id, c);
    try {
      const index = await loadIndex(
        layers.value.find((l) => l.id === id)!,
        c.signal,
      );
      if (c.signal.aborted || !enabled.value.includes(id)) return;
      indices.value[id] = index;
      settings.value[id] ??= {
        opacity: 0.8,
        min: index.min ?? 0,
        max: index.max ?? 3,
        palette: "thermal",
      };
      status.value[id] = "select";
      if (!currentDate.value || !dates.value.includes(currentDate.value)) {
        currentDate.value = index.files.at(-1)?.datetime.slice(0, 10) || "";
        currentTime.value = "";
        query.value = null;
      }
    } catch (e) {
      if (!c.signal.aborted) {
        status.value[id] = "error";
        error.value = String(e);
      }
    } finally {
      if (controllers.get(id) === c) controllers.delete(id);
    }
  }
  function chooseDate(date: string) {
    currentDate.value = date;
    currentTime.value = "";
    query.value = null;
  }
  function chooseTime(time: string) {
    currentTime.value = time;
    currentDate.value = time.slice(0, 10);
    query.value = null;
  }
  function move(id: string, direction: number) {
    const i = enabled.value.indexOf(id),
      j = i + direction;
    if (j >= 0 && j < enabled.value.length) {
      const a = [...enabled.value];
      [a[i], a[j]] = [a[j]!, a[i]!];
      enabled.value = a;
    }
  }
  return {
    locale,
    theme,
    layers,
    enabled,
    indices,
    settings,
    status,
    currentTime,
    currentDate,
    error,
    ready,
    panelOpen,
    timePanelOpen,
    query,
    times,
    dates,
    dayTimes,
    init,
    toggle,
    chooseDate,
    chooseTime,
    move,
  };
});
