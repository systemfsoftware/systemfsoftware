import { JSONSchema, Schema as S } from 'effect'

import { ENTRY_PATTERN_OPTION } from './shared-entry-pattern.config.js'

// The doctrine's 7±2 working-memory span is the shared policy's pick, not the
// rule's: the rule carries this default, and the policy layer (the repo's base
// oxlint config) states the number explicitly when it switches the rule on.
export const DEFAULT_NAME_SPAN = 9

export const Options = S.Struct({
  entryPattern: ENTRY_PATTERN_OPTION,
  nameSpan: S.optionalWith(
    S.Number,
    { default: () => DEFAULT_NAME_SPAN },
  ),
})

export const NAME_SPAN_EXPECTED = (bound: number): string => `at most ${bound} top-level names`

export const NAME_SPAN_ACTUAL = (count: number): string => `${count} top-level names`

export const NAME_SPAN_FIX = 'group related names behind export * as Ns, which counts as one' as const

export const NAME_SPAN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A declared entry exposes at most the configured span of top-level names; chunking devices — export * as Ns and exported as const object literals — count as one name each, and the report carries the actual count and the bound so the reader can decide how many names to chunk away',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    nameSpan: NAME_SPAN_MESSAGE,
  },
} as const
