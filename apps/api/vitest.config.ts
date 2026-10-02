import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app'),
      '@components': path.resolve(__dirname, './components'),
      '@lib': path.resolve(__dirname, './lib'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.{ts,tsx}', 'lib/__tests__/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});