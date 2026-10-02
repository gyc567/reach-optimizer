import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts', '__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@lib': resolve(__dirname, 'lib'),
      '@components': resolve(__dirname, 'components'),
      '@reach/ai-checks': resolve(__dirname, '../../packages/ai-checks/src'),
      '@reach/rules-engine': resolve(__dirname, '../../packages/rules-engine/src'),
      '@reach/shared-types': resolve(__dirname, '../../packages/shared-types/src'),
    },
  },
});