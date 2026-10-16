import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default defineConfig({
  testDir: '.',
  testMatch: /\.pw\.ts$/,
  fullyParallel: false,
  workers: 1,
  outputDir: join(tmpdir(), 'effect-playwright-test-results'),
  reporter: 'list',
})
