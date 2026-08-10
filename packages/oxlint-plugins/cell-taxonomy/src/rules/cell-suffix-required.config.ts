import type { RuleMeta } from '@oxlint/plugins'

/** A default, not a closed world - a project's own suffixes extend it through the `cells` option. */
export const CELLS: ReadonlyArray<string> = [
  'acl',
  'adapter',
  'combinator',
  'executor',
  'handler',
  'harness',
  'kernel',
  'middleware',
  'observer',
  'policy',
  'schema',
  'shape',
  'state',
  'store',
  'workflow',
]

export const EXEMPT: ReadonlyArray<string> = ['index.ts', 'main.ts', 'mod.ts']

export const SRC_DIR = 'src' as const

export const DECLARATION_SEGMENT = 'd' as const

/** A generated artifact cannot be renamed to name a cell, so the suffix rule must exempt it. */
export const GENERATED_SEGMENT = 'generated' as const

/** Test filenames belong to the test-placement plugin, which is their sole owner. */
export const TEST_SEGMENTS: ReadonlySet<string> = new Set(['test', 'spec'])

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['__tests__'])

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const UNSANCTIONED_ACTUAL = 'a source file under src/ whose basename names no cell' as const

export const UNSANCTIONED_FIX =
  "rename it <name>.<cell>.ts after the job the file does; if it is a barrel or a composition root give it an exempt name; if this project sanctions another suffix, add it to this rule's cells or exempt option" as const

export const meta: RuleMeta = {
  type: 'problem',
  docs: {
    description:
      'Every source file under src/ names the cell it is - <name>.<cell>.ts - or carries an exempt entrypoint name.',
  },
  schema: [
    {
      type: 'object',
      properties: {
        cells: { type: 'array', items: { type: 'string' } },
        exempt: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  ],
  defaultOptions: [{ cells: [...CELLS], exempt: [...EXEMPT] }],
  messages: {
    unsanctionedCell: MESSAGE,
  },
}
