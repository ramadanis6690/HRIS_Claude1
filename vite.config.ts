import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tampilan dibangun jadi berkas statis di dist/client lalu disajikan Nginx
// (design_final.md §2.1). Saat pengembangan, /api diteruskan ke server Node.
export default defineConfig({
  root: 'src/client',
  publicDir: 'publik',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
