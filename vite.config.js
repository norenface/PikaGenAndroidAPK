import { defineConfig } from 'vite';

// Capacitor の WebView は file/https ローカル配信なので相対パスでビルドする
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
