import { propertyReplay } from '@systemfsoftware/vitest/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({ plugins: [propertyReplay()], test: { name: 'beta', include: ['*.probe.ts'] } })
