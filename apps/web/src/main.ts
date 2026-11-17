import '@tabler/core/dist/css/tabler.min.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { useThemeStore } from './stores/theme';

const pinia = createPinia();
// Tema diterapkan sebelum aplikasi tampil, agar layar tidak berkedip terang-gelap.
useThemeStore(pinia);
createApp(App).use(pinia).use(router).mount('#app');
