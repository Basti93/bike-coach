import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), service: resolve('src/service/main.ts'), coach: resolve('src/coach/main.ts') } } },
  },
  renderer: {
    root: 'src/ui',
    // The web app's static files, for the exercise pictures the shared tracking screens show.
    publicDir: resolve('src/web/public'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve('src/ui/index.html') } },
  },
});
