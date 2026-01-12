import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // 将 SDK 设为外部依赖，不打包进 bundle
        // 这样它会保留在 node_modules 中，可以被 asarUnpack 解压
        '@anthropic-ai/claude-agent-sdk',
      ],
    },
  },
});
