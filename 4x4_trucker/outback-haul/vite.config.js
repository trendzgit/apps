import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/            normal multi-file build (supports ./models/*.glb next to it)
// `npm run build:single` -> dist-single/     ONE self-contained index.html, like the original game
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    outDir: single ? 'dist-single' : 'dist',
  },
});
