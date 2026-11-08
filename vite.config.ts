import { defineConfig } from 'vite';

// docs/07 §2.3 配置要点：base './'、build.target 'es2020'、dev server 仅监听 localhost。
// alias '@'→'/src' 用 Vite 根相对写法，避免引入 @types/node（不在已批准依赖表内，DEPENDENCIES.md §2.4 纪律）。
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
  },
});
