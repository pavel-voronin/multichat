import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import {
  createDefaultRuntime,
  disposeChatApp,
  initializeChatApp,
} from './vue/bootstrap';

void (async () => {
  const app = createApp(App);
  const pinia = createPinia();
  const { runtime, isFreshWorkspace } = await createDefaultRuntime();

  initializeChatApp(pinia, runtime, { isFreshWorkspace });
  app.use(pinia);
  app.onUnmount(() => {
    disposeChatApp(pinia);
  });
  app.mount('#app');
})();
