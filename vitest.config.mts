import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    maxWorkers: 2,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      // These files contain type declarations only; they have no executable code.
      exclude: ['src/**/*.d.ts', 'src/shared/types.ts'],
      reporter: ['text', 'html', 'json', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      thresholds: { lines: 100, statements: 100, branches: 100, functions: 100, perFile: true }
    }
  }
});
