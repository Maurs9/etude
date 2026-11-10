import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ROOT = resolve(import.meta.dirname);
const APP = resolve(ROOT, 'src/domain/views-runtime.ts');

function migrationPlugin() {
  return {
    name: 'etude-migration-runtime',
    enforce: 'pre',
    transform(source, id) {
      if (resolve(id) !== APP) return null;
      const transformed = `${source}\nwindow.__etudeBooted?.();\n`;
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
    rolldownOptions: { input: resolve(ROOT, 'etude.html') },
  },
});
