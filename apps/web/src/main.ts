import '@tabler/core/dist/css/tabler.min.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { followSystemTheme } from './theme';

followSystemTheme();
createApp(App).use(createPinia()).use(router).mount('#app');
