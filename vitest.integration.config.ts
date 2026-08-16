import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Separate from vitest.config.ts on purpose: these tests hit a real
// Postgres (see src/testing/db.ts), so they run in a Node environment, not
// jsdom, and sequentially against one shared database rather than in
// parallel. Run with `pnpm test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
