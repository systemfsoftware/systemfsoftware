import { propertyTests } from '@systemfsoftware/vitest/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({ plugins: [propertyTests()], test: { name: 'beta', include: ['*.probe.ts'] } })
