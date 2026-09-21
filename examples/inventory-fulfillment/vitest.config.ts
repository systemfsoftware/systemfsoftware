import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.integration.test.ts'],
    server: {
      deps: {
        inline: [/better-auth/, /@better-auth\//, /better-call/, /@better-fetch\//, /@opentelemetry\//],
      },
    },
  },
})
