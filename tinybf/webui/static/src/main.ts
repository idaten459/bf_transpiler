import { createPinia } from 'pinia';
import { createApp } from 'vue';

import { App } from './app';
import { useSessionStore } from './store/session';

const pinia = createPinia();

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Missing #app root element in index.html');
}

const app = createApp(App);
app.use(pinia);
app.mount(appRoot);

// Ensure store is initialized for immediate reactivity
const session = useSessionStore();
session.ensureScrollToCurrent();

