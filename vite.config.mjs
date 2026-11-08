import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ROOT = resolve(import.meta.dirname);
const APP = resolve(ROOT, 'src/legacy/app.js');
const BRIDGE = resolve(ROOT, 'src/legacy/bridge.js');

function migrationPlugin() {
  const bridge = readFileSync(BRIDGE, 'utf8');
  return {
    name: 'etude-migration-runtime',
    enforce: 'pre',
    transform(source, id) {
      if (resolve(id) !== APP) return null;
      const transformed = `${bridge}${source}\nwindow.__etudeBooted?.();\n`;
      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [migrationPlugin()],
  build: {
    outDir: 'dist/etude',
    emptyOutDir: true,
    rollupOptions: { input: resolve(ROOT, 'etude.html') },
  },
});
