import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // e2e specs share one database; never run files concurrently.
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
  },
});
