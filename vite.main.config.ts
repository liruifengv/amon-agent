import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        // Keep turndown as a runtime dependency so its Node-side parser deps
        // are packaged instead of being hidden inside the main bundle.
        'turndown',
        // turndown lazily requires domino in the Electron main process
        '@mixmark-io/domino',
        // ws optional native deps
        'bufferutil',
        'utf-8-validate',
      ],
    },
  },
});
