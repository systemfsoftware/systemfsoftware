import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { projects: ['alpha/vitest.probe.config.ts', 'beta/vitest.probe.config.ts'] } })
