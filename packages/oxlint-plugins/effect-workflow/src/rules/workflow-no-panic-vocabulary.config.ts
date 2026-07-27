import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const PANIC_PREFIXES = ['Unexpected', 'Impossible', 'Unreachable', 'Invariant'] as const

export const GENERIC_SUFFIXES = [
  '',
  'Error',
  'State',
  'StateError',
  'Case',
  'CaseError',
  'Input',
  'InputError',
  'Data',
  'DataError',
  'Value',
  'ValueError',
  'Condition',
  'ConditionError',
  'Violation',
  'ViolationError',
] as const

export const PANIC_MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Flag workflow error variants whose names are pure panic vocabulary (Unexpected*, Impossible*, Unreachable*, Invariant* with no domain noun). The error channel holds expected domain errors only.',
  },
  schema: [Options],
  messages: {
    panicVocabulary: PANIC_MESSAGE,
  },
} as const
