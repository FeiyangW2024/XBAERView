import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
vi.mock('../src/services/catalog', () => ({loadIndex: vi.fn(),bootstrap: vi.fn()}));
import { loadIndex } from '../src/services/catalog';
import { useView } from '../src/stores/view';
import { useCompare } from '../src/stores/compare';
const index = (id: string, times: string[]) => ({id,name:{zh:id,en:id},type:'continuous',min:0,max:10,files:times.map(datetime => ({datetime}))}) as any;
beforeEach(() => {vi.stubGlobal('localStorage',{getItem:()=>null});setActivePinia(createPinia());vi.mocked(loadIndex).mockReset();});
it('same product uses distinct available times, shared scale, preserves normal state', async () => {
 const v=useView(), c=useCompare();v.layers=[{id:'a'} as any];v.enabled=['a'];v.currentTime='t2';v.indices.a=index('a',['t1','t2']);
 c.start();await Promise.resolve();
 expect(c.times).toEqual(['t2','t1']);expect(c.settings[0]).toBe(c.settings[1]);
 c.stop();expect(v.enabled).toEqual(['a']);expect(v.currentTime).toBe('t2');expect(c.indices).toEqual([null,null]);
});
it('sync uses intersection and never picks nearest time', async () => {
 const v=useView(),c=useCompare();v.layers=[{id:'a'},{id:'b'}] as any;v.indices.a=index('a',['t1','t2']);v.indices.b=index('b',['t2','t3']);
 c.start();await Promise.resolve();expect(c.times).toEqual(['t2','t2']);
 c.link(false);c.time(1,'t3');expect(c.times).toEqual(['t2','t3']);c.swap();expect(c.ids).toEqual(['b','a']);
 v.indices.a=index('a',['t4']);await c.select(1,'a');c.link(true);expect(c.times).toEqual(['','']);
});
it('cancelled index request cannot repopulate comparison after exit', async () => {
 const v=useView(),c=useCompare();v.layers=[{id:'a'} as any];let done!: (v:any)=>void;
 vi.mocked(loadIndex).mockImplementation(() => new Promise(resolve => {done=resolve;}));
 c.active=true;const pending=c.select(0,'a');c.stop();done(index('a',['t1']));await pending;expect(c.indices).toEqual([null,null]);
});
it('switching from disjoint products to same product restores both valid times', async () => {
 const v=useView(),c=useCompare();v.layers=[{id:'a'},{id:'b'}] as any;v.indices.a=index('a',['t1','t2']);v.indices.b=index('b',['t3']);
 c.start();await Promise.resolve();expect(c.times).toEqual(['','']);
 await c.select(1,'a');expect(c.times).toEqual(['t2','t1']);
});
