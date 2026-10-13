import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Tes integrasi memakai satu basis data uji; jalankan berurutan.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
