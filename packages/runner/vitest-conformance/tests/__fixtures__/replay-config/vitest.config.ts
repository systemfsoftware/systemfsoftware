import { propertyReplay } from '@systemfsoftware/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [propertyReplay()],
  test: { include: ['*.probe.ts'] },
})
