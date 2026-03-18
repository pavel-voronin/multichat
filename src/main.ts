import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { disposeChatApp, initializeChatApp } from './vue/bootstrap';

const app = createApp(App);
const pinia = createPinia();

initializeChatApp(pinia);
app.use(pinia);
app.onUnmount(() => {
  disposeChatApp(pinia);
});
app.mount('#app');
