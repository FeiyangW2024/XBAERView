/**
 * XBAER View
 * Created by Feiyang.
 * date: 2026.10.04
 * Have a nice day!
 * Give People Wonderful tools,
 * And They'll do Wonderful Things!
 */
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "ol/ol.css";
import "./style.css";
createApp(App).use(createPinia()).mount("#app");
