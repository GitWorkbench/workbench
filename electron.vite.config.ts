import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/index.ts' },
      rollupOptions: { external: ['simple-git'] }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: 'src/preload/index.ts' }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'out/renderer', rollupOptions: { input: 'src/renderer/index.html' } },
    plugins: [react()]
  }
});
