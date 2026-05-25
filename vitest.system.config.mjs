import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/system/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
  },
});
