import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: 'e2e/**/*.e2e.ts',
  workers: 1,
})
