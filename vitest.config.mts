import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',          // default; los server-side lo pisan a node por archivo
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // Gate: if a PR drops coverage below these, vitest fails (exit != 0)
        // and CI rejects it. Based on current measurement:
        // stmts 93.71 / branch 100 / funcs 63.63 / lines 93.65.
        statements: 90,
        branches: 90,
        functions: 60,
        lines: 90,
      },
    },
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
});