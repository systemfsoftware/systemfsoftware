import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const serverConditionsWithoutBundlerModule = ['node', 'development|production', '@systemfsoftware/source']

export default defineConfig({
  ...sharedConfig,
  ssr: { resolve: { conditions: serverConditionsWithoutBundlerModule } },
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    server: {
      deps: {
        inline: [/better-auth/, /@better-auth\//, /better-call/, /@better-fetch\//, /@opentelemetry\//],
      },
    },
  },
})
