import { defineConfig, web } from '@systemfsoftware/effect-e2e'

import { ORIGIN } from './site.js'

export default defineConfig({
  projectId: 'runner-suite',
  targets: [{ name: 'web', engine: web({ browser: 'chromium' }), app: { url: ORIGIN, identity: 'billing' } }],
  agents: {
    default: {
      model: {
        gateway: 'openai-compatible',
        baseURL: 'http://127.0.0.1:9',
        model: 'never-called',
        apiKeyEnv: 'RUNNER_SUITE_API_KEY',
      },
    },
  },
  cache: { mode: 'off' },
  assertionTimeout: 400,
})
