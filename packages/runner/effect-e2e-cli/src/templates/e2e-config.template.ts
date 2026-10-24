import * as Match from 'effect/Match'

import { type Gateway, GATEWAY_DEFAULTS, modelOf, type SuiteAnswers } from './answers.js'

const modelSpecOf = (gateway: Gateway, model: string): string =>
  Match.value(gateway).pipe(
    Match.when(
      'openrouter',
      () => `{ gateway: 'openrouter', model: ${JSON.stringify(model)}, apiKeyEnv: API_KEY_ENV }`,
    ),
    Match.when('openai-compatible', () =>
      [
        '{',
        "        gateway: 'openai-compatible',",
        "        baseURL: process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',",
        `        model: ${JSON.stringify(model)},`,
        '        apiKeyEnv: API_KEY_ENV,',
        '      }',
      ].join('\n')),
    Match.exhaustive,
  )

export const e2eConfigTemplate = (answers: SuiteAnswers): string =>
  `import { defineConfig, web } from '@systemfsoftware/effect-e2e'

// The suite's edge: the only file in the suite that reads process.env.

const API_KEY_ENV = '${GATEWAY_DEFAULTS[answers.gateway].apiKeyEnv}'

/** The environment the runner resolves secrets and the model API key from. */
export const env: Readonly<Record<string, string | undefined>> = process.env

/** CI runs retry once, use one worker, and only read the replay cache. */
export const ci: boolean = (process.env['CI'] ?? '') !== ''

/** Why the agent example cannot run here, or false when the model gateway's API key is set. */
export const agentSkip: string | false = (process.env[API_KEY_ENV] ?? '') === ''
  ? \`\${API_KEY_ENV} is not set, so the agent has no model gateway to call\`
  : false

export const baseUrl: string = process.env['BASE_URL'] ?? 'http://localhost:3000'

export const engine = web({ browser: 'chromium', headless: true })

export default defineConfig({
  projectId: ${JSON.stringify(answers.projectId)},
  targets: [{
    name: 'web',
    engine,
    app: { url: baseUrl, identity: ${JSON.stringify(answers.projectId)} },
  }],
  agents: {
    default: {
      model: ${modelSpecOf(answers.gateway, modelOf(answers))},
    },
  },
})
`
