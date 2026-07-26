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

export const PANIC_MESSAGE =
  '{{name}} is forbidden. Expected: error variants named for expected domain failures a consumer can handle. Actual: {{name}} is pure panic vocabulary ({{token}}) — panics are defects at the shell edge, not typed errors in a workflow. Fix: rename it for the domain failure, or delete it and let the invariant surface as a defect.' as const

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
