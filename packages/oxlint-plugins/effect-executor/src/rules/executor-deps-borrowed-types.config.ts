import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const EXPECTED_DEPENDENCY_TYPE = "the provider's type borrowed with Provider['Type']['method']" as const

export const BORROW_FIX_TEMPLATE =
  "import type the provider and borrow the method type: Provider['Type']['<method>']" as const

export const HAND_WRITTEN_METHOD_SIGNATURE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'In *.executor.ts, every method of a Context.Tag Deps shape must borrow the provider type via indexed access — no hand-written signatures.',
  },
  schema: [Options],
  messages: {
    handWrittenMethodSignature: HAND_WRITTEN_METHOD_SIGNATURE_MESSAGE,
  },
} as const
