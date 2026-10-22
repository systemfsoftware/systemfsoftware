import { Effect } from 'effect'
import { dual } from 'effect/Function'
import { defaultTestGlobs } from './config.js'
import { SuiteExists } from './errors.schema.js'
import { SuiteFsError } from './suite-fs.schema.js'
import { SuiteFs } from './suite-fs.service.js'

export interface InitOptions {
  readonly engine: 'web'
  readonly gateway: 'openrouter' | 'openai-compatible' | 'none'
  readonly model?: string
  readonly force: boolean
}

export type InitFailure = SuiteExists | SuiteFsError

const SCAFFOLD_FILES: ReadonlyArray<string> = [
  '.gitignore',
  'e2e.config.ts',
  'package.json',
  'tests/example-agent.e2e.ts',
  'tests/example.e2e.ts',
  'vitest.config.ts',
]

const slugOf = (dir: string): string => dir.split('/').filter((segment) => segment.length > 0).pop() ?? 'suite'

const agentsBlock = (options: InitOptions): string => {
  if (options.gateway === 'none') return ''
  const model = options.gateway === 'openrouter'
    ? `        gateway: 'openrouter',
        model: '${options.model ?? 'deepseek/deepseek-flash-latest'}',
        apiKeyEnv: 'OPENROUTER_API_KEY',`
    : `        gateway: 'openai-compatible',
        baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:8080/v1',
        apiKeyEnv: 'E2E_API_KEY',${options.model !== undefined ? `\n        model: '${options.model}',` : ''}`
  return `  agents: {
    default: {
      model: {
${model}
      },
    },
  },
`
}

const e2eConfigTemplate = (slug: string, options: InitOptions): string =>
  `import { defineConfig, web } from '@systemfsoftware/effect-e2e'

export default defineConfig({
  projectId: '${slug}',
  targets: [
    {
      name: 'web',
      engine: web({ browser: 'chromium' }),
      app: {
        url: process.env['E2E_TARGET_URL'] ?? 'http://localhost:5173',
        identity: '${slug}',
      },
    },
  ],
  tests: ${JSON.stringify([...defaultTestGlobs])},
${agentsBlock(options)}})
`

const vitestConfigTemplate = `import { sharedConfig } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ${JSON.stringify([...defaultTestGlobs])},
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/__fixtures__/**', '.e2e/**'],
    includeSource: [],
    runner: '@systemfsoftware/effect-e2e/runner',
  },
})
`

const packageJsonTemplate = (slug: string): string =>
  `{
  "name": "${slug}-e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "test:e2e": "effect-e2e run --dir ."
  },
  "devDependencies": {
    "@systemfsoftware/effect-e2e": "^0.1.0",
    "@systemfsoftware/vitest-config": "^0.1.0",
    "vitest": "^5.0.5"
  }
}
`

const gitignoreTemplate = '.e2e/\nnode_modules/\n'

const exampleTestTemplate = `import { expect, test } from '@systemfsoftware/effect-e2e'

test('the suite runs a deterministic check with zero model calls', () => {
  expect(2 + 2).toBe(4)
  expect(['effect', 'e2e']).toContain('e2e')
})
`

const agentExampleTemplate = `import { test } from '@systemfsoftware/effect-e2e'

test('an agent reaches the signed-in home', { tags: ['agent'] }, async ({ agent }) => {
  await agent.act('sign in and reach the home screen')
  await agent.assert('the home screen greets the member by name')
})
`

export const scaffoldFiles: {
  (dir: string, options: InitOptions): ReadonlyArray<[string, string]>
  (options: InitOptions): (dir: string) => ReadonlyArray<[string, string]>
} = dual(2, (dir: string, options: InitOptions): ReadonlyArray<[string, string]> => [
  ['.gitignore', gitignoreTemplate],
  ['e2e.config.ts', e2eConfigTemplate(slugOf(dir), options)],
  ['package.json', packageJsonTemplate(slugOf(dir))],
  ['tests/example-agent.e2e.ts', agentExampleTemplate],
  ['tests/example.e2e.ts', exampleTestTemplate],
  ['vitest.config.ts', vitestConfigTemplate],
])

export const initSuite: {
  (dir: string, options: InitOptions): Effect.Effect<ReadonlyArray<string>, InitFailure, SuiteFs>
  (options: InitOptions): (dir: string) => Effect.Effect<ReadonlyArray<string>, InitFailure, SuiteFs>
} = dual(
  2,
  (dir: string, options: InitOptions): Effect.Effect<ReadonlyArray<string>, InitFailure, SuiteFs> =>
    Effect.gen(function*() {
      const fs = yield* SuiteFs
      const files = scaffoldFiles(dir, options)
      if (!options.force) {
        for (const file of SCAFFOLD_FILES) {
          if (yield* fs.exists(file)) {
            return yield* new SuiteExists({ path: file })
          }
        }
      }
      for (const [path, content] of files) {
        yield* fs.writeFileString(path, content)
      }
      return files.map(([path]) => path)
    }),
)
