import type { SuiteAnswers } from './answers.js'
import { e2eConfigTemplate } from './e2e-config.template.js'
import { exampleAgentTemplate } from './example-agent.template.js'
import { exampleTemplate } from './example.template.js'
import { globalSetupTemplate } from './global-setup.template.js'
import { runnerTemplate } from './runner.template.js'
import { vitestConfigTemplate } from './vitest-config.template.js'

export interface RenderedFile {
  readonly path: string
  readonly content: string
}

export const TEST_E2E_SCRIPT = 'vitest run'

export const IGNORED_OUTPUT = '.e2e/'

export const SUITE_DEPENDENCIES = [
  '@effect/platform-node',
  '@systemfsoftware/effect-e2e',
  '@systemfsoftware/effect-e2e-web',
  '@systemfsoftware/vitest-config',
  'effect',
  'playwright',
  'vitest',
] as const

export const suiteFilesOf = (answers: SuiteAnswers): ReadonlyArray<RenderedFile> => [
  { path: 'e2e.config.ts', content: e2eConfigTemplate(answers) },
  { path: 'vitest.config.ts', content: vitestConfigTemplate() },
  { path: 'runner.ts', content: runnerTemplate(answers) },
  { path: 'global-setup.ts', content: globalSetupTemplate() },
  { path: 'tests/example.e2e.ts', content: exampleTemplate() },
  { path: 'tests/example-agent.e2e.ts', content: exampleAgentTemplate() },
]
