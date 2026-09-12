import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useView } from './view';
import { loadIndex } from '../services/catalog';
import type { ProductIndex, LayerSettings } from '../types';
export const useCompare = defineStore('compare', () => {
 const view = useView();
 const active = ref(false), fraction = ref(.5), linked = ref(false);
 const ids = ref(['','']), times = ref(['','']);
 const indices = ref<(ProductIndex | null)[]>([null,null]);
 const settings = ref<LayerSettings[]>([]), status = ref(['','']);
 const requests: (AbortController | undefined)[] = [];
 const available = computed(() => indices.value.map(i => [...new Set(i?.files.map(f => f.datetime) ?? [])].sort()));
 const common = computed(() => available.value[0]!.filter(t => available.value[1]!.includes(t)));
 function reconcile() {
  if(linked.value) { const time = common.value.includes(times.value[0]!) ? times.value[0]! : common.value.at(-1) ?? ''; times.value = [time,time]; }
 }
 async function select(side: number, id: string) {
  requests[side]?.abort(); const c = new AbortController(); requests[side] = c;
  ids.value[side] = id; indices.value[side] = null; times.value[side] = ''; status.value[side] = 'loading';
  try {
   const layer = view.layers.find(l => l.id === id); if(!layer) return;
   const index = view.indices[id] ?? await loadIndex(layer,c.signal);
   if(c.signal.aborted || !active.value) return;
   indices.value[side] = index;
   settings.value[side] = {...(view.settings[id] ?? {opacity:.8,min:index.files.at(-1)?.statistics?.min ?? 0,max:index.files.at(-1)?.statistics?.p95 ?? 1,palette:'thermal'})};
   times.value[side] = available.value[side]!.includes(view.currentTime) ? view.currentTime : available.value[side]!.at(-1) ?? '';
   if(ids.value[0] === ids.value[1] && indices.value[0] && indices.value[1]) {
    linked.value = false; settings.value[1] = settings.value[0]!;
    if(!available.value[0]!.includes(times.value[0]!)) times.value[0] = available.value[0]!.at(-1) ?? '';
    times.value[1] = available.value[1]!.filter(t => t !== times.value[0]).at(-1) ?? times.value[0]!;
   }
   status.value[side] = ''; reconcile();
  } catch(e) { if(!c.signal.aborted) {status.value[side] = 'error'; view.error = String(e);} }
 }
 function start() {
  active.value = true; fraction.value = .5; view.timePanelOpen = true;
  const choices = view.enabled.length ? view.enabled : view.layers.map(l => l.id);
  const left = choices[0] ?? '', right = choices[1] ?? left;
  linked.value = left !== right;
  void select(0,left); void select(1,right);
 }
 function stop() { active.value = false; requests.forEach(c => c?.abort()); indices.value = [null,null]; times.value = ['','']; view.query = null; }
 function link(value: boolean) {linked.value = value; if(!value) times.value = times.value.map((t,i) => available.value[i]!.includes(t) ? t : available.value[i]!.at(-1) ?? ''); reconcile();}
 function time(side: number, value: string) {if(!(linked.value ? common.value : available.value[side]!).includes(value)) return;times.value[side] = value; reconcile();if(linked.value) times.value = [value,value];}
 function swap() { if(status.value.includes('loading')) return; ids.value.reverse();indices.value.reverse();settings.value.reverse();times.value.reverse();status.value.reverse(); }
 return {active,fraction,linked,ids,times,indices,settings,status,available,common,select,start,stop,link,time,swap};
});
