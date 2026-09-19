import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          lucide: ['lucide-react'],
          // NEIS 파일을 읽는 xlsx는 1단계에서 쓰고,
          // 엑셀을 쓰는 exceljs는 버튼을 누를 때 따로 불러옵니다.
          excel: ['xlsx'],
          firebase: ['firebase/app', 'firebase/firestore'],
        },
      },
    },
  },
});