import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// A run that collects no test file must fail.
export default defineConfig({ ...sharedConfig, test: { ...sharedConfig.test, passWithNoTests: false } })
