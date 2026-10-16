import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const WORKFLOW_SUFFIX = '.workflow.ts' as const

export const STEM_PATTERN = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/

export const MAX_STEM_TOKENS = 5

export const VACANT_FIRST_TOKENS: Record<string, true> = {
  apply: true,
  decide: true,
  do: true,
  execute: true,
  handle: true,
  manage: true,
  operate: true,
  perform: true,
  process: true,
  run: true,
  work: true,
}

export const MECHANISM_TOKENS: Record<string, true> = {
  adapter: true,
  cell: true,
  config: true,
  controller: true,
  delegation: true,
  doctrine: true,
  executor: true,
  handler: true,
  helper: true,
  hooks: true,
  impl: true,
  instrument: true,
  kernel: true,
  logic: true,
  make: true,
  manager: true,
  output: true,
  plugin: true,
  plugins: true,
  processor: true,
  reporter: true,
  sandbox: true,
  sandwich: true,
  service: true,
  settings: true,
  util: true,
  workflow: true,
}

export const STEM_NOT_KEBAB_EXPECTED = 'a kebab-case stem of 2-5 lowercase tokens naming the decision' as const
export const STEM_NOT_KEBAB_ACTUAL =
  'a stem with uppercase letters, underscore separators, or more than 5 hyphen-separated tokens' as const
export const STEM_NOT_KEBAB_FIX =
  'rename the file to 2-5 lowercase hyphen-separated tokens and rename the value export to the stem in camelCase' as const

export const STEM_TOO_SHORT_EXPECTED = 'a stem of 2-5 tokens naming the decision' as const
export const STEM_TOO_SHORT_ACTUAL = 'a single-token stem' as const
export const STEM_TOO_SHORT_FIX =
  'rename the file to a 2-5 token kebab phrase naming the decision and rename the value export to the stem in camelCase' as const

export const VACANT_FIRST_TOKEN_EXPECTED =
  'a stem whose first token names the decision instead of a vacant verb' as const
export const VACANT_FIRST_TOKEN_ACTUAL = 'a stem whose first token is a vacant verb' as const
export const VACANT_FIRST_TOKEN_FIX =
  'replace the first token with the verb naming the decision this file owns and rename the value export to the stem in camelCase' as const

export const MECHANISM_STEM_EXPECTED = 'a stem naming the decision instead of the mechanism holding it' as const
export const MECHANISM_STEM_ACTUAL = 'a stem starting with or consisting of a mechanism token' as const
export const MECHANISM_STEM_FIX =
  'replace the mechanism token with the decision this file owns and rename the value export to the stem in camelCase' as const

export const STEM_EXPORT_MISMATCH_EXPECTED =
  "a stem equal to the camelCase of the file's single non-schema value export" as const
export const STEM_EXPORT_MISMATCH_ACTUAL = 'a stem whose camelCase differs from the single value export name' as const
export const ANONYMOUS_EXPORT_ACTUAL = 'a single value export with no readable name' as const
export const STEM_EXPORT_MISMATCH_FIX = 'rename the value export to the stem in camelCase' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "A <stem>.workflow.ts stem is a kebab-case phrase of 2-5 lowercase tokens naming the decision, locked to the camelCase of the file's single non-schema value export.",
  },
  schema: [Options],
  messages: {
    mechanismStem: MESSAGE,
    stemExportMismatch: MESSAGE,
    stemNotKebab: MESSAGE,
    stemTooShort: MESSAGE,
    vacantFirstToken: MESSAGE,
  },
} as const
