import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const REQUIRES_DEPS_TAG_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DEPENDENCY_TAG_CONSTRUCTORS = [
  ['Context', 'Tag'],
  ['Context', 'GenericTag'],
  ['Effect', 'Tag'],
  ['Effect', 'Service'],
] as const

export const MISSING_DEPS_TAG_NAME = 'An executor that declares no dependency Tag' as const

export const MISSING_DEPS_TAG_ACTUAL = 'an executor acquiring services it does not own' as const

export const MISSING_DEPS_TAG_FIX =
  'declare the consumer-owned Tag and acquire every service through it, or rename the file to the cell it actually is' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Require every *.executor.ts to declare its own dependency Tag. The matcher is broader than the canonical Context.Tag one in executor-deps-tag-name, which judges a Tag name; this rule asks only whether the operation owns its dependencies at all, and Effect.Service or Context.GenericTag own them just as well. An executor that acquires a provider Tag directly rejects no dependencies: it is a header interface, not a role interface.',
  },
  schema: [Options],
  messages: {
    missingDepsTag: REQUIRES_DEPS_TAG_MESSAGE,
  },
} as const
