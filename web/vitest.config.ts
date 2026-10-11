import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://claims:claims@127.0.0.1:5442/claims_test' },
    testTimeout: 120000,
    hookTimeout: 300000,
    fileParallelism: false,
  },
})
