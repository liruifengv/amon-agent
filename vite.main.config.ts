import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // ws 的可选原生依赖，无法被 Vite 打包
        // 依赖链：pi-ai → openai → ws → bufferutil / utf-8-validate
        'bufferutil',
        'utf-8-validate',
      ],
    },
  },
});
