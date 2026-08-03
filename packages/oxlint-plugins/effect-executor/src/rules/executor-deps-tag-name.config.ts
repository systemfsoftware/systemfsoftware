import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const DEPS_TAG_NAME_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const PROVIDER_NAMED_TAG_FIX =
  'rename the Tag after the executor that consumes it, never after the provider' as const

export const TAG_IDENTIFIER_MISMATCH_FIX =
  'make the Context.Tag identifier string the class name, or the deterministic key that ends in it' as const

export const MULTIPLE_DEPS_TAGS_FIX =
  'split the operation into two executors, or merge the Tags into one <Executor>Deps' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Enforce the consumer-owned <Executor>Deps Context.Tag in *.executor.ts files: exactly one, named after the file, with an identifier string that names it — the bare class name or the deterministic key ending in it.',
  },
  schema: [Options],
  messages: {
    providerNamedTag: DEPS_TAG_NAME_MESSAGE,
    tagIdentifierMismatch: DEPS_TAG_NAME_MESSAGE,
    multipleDepsTags: DEPS_TAG_NAME_MESSAGE,
  },
} as const
