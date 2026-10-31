import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), service: resolve('src/service/main.ts') } } },
  },
  renderer: {
    root: 'src/ui',
    plugins: [react()],
    build: { rollupOptions: { input: resolve('src/ui/index.html') } },
  },
});
