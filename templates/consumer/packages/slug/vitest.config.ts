import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The package's tests are in-source; a run that collects none must fail.
export default defineConfig({ ...sharedConfig, test: { ...sharedConfig.test, passWithNoTests: false } })
