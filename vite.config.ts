import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@styles': resolve(rootDir, 'src/styles.css'),
    },
  },
  plugins: [tailwindcss(), vue(), Icons({ compiler: 'vue3' })],
  build: {
    lib: {
      entry: {
        vue: resolve(rootDir, 'src/vue/index.ts'),
        core: resolve(rootDir, 'src/core/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
