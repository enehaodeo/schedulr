import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 部署到子路径（如 GitHub Pages 的 /schedulr/）时由构建环境传入
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Schedulr 时间管理',
        short_name: 'Schedulr',
        lang: 'zh-CN',
        start_url: '.',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
