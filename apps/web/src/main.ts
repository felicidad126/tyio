import '@tabler/core/dist/css/tabler.min.css';
import './styles.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { useThemeStore } from './stores/theme';

const app = createApp(App);
app.use(createPinia());
// Tema dipasang sebelum halaman pertama tampil, agar tidak berkedip terang lalu gelap.
useThemeStore();
app.use(router);
app.mount('#app');
