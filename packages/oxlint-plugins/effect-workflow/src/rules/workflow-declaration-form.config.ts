import { Schema as S } from 'effect'

export const Options = S.Struct({})
export type Options = S.Schema.Type<typeof Options>

export const DECLARATION_FORM_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MODULE_SOURCE = '@systemfsoftware/effect-cell-types' as const
export const WORKFLOW_TYPE_NAME = 'Workflow' as const
export const MAKE_METHOD_NAME = 'make' as const

export const NAME_FALLBACK = 'the exported workflow' as const

export const MISSING_MAKE_EXPECTED = 'export const <name> = Workflow.make((command) => ...)' as const
export const MISSING_MAKE_ACTUAL = 'an exported const whose initializer is not a call to Workflow.make(...)' as const
export const MISSING_MAKE_FIX =
  'produce the workflow with `export const <name> = Workflow.make((command) => ...)`, importing { Workflow } from @systemfsoftware/effect-cell-types; only the constructor infers the decision and error channels and derives the UninhabitedDecision / UninhabitedError markers' as const

export const FUNCTION_DECLARATION_ACTUAL =
  'an exported function declaration — a function declaration cannot carry a Workflow.make(...) call' as const

export const ANNOTATION_EXPECTED = 'a call to Workflow.make(...) with no type annotation on the const' as const
export const ANNOTATION_ACTUAL =
  'a Workflow.Workflow<...> type annotation instead of a Workflow.make(...) call' as const
export const ANNOTATION_FIX =
  'replace the annotation with `export const <name> = Workflow.make((command) => ...)`; a hand-written Workflow.Workflow<...> annotation cannot derive the UninhabitedDecision / UninhabitedError markers that the constructor infers' as const

export const LOCAL_TYPE_EXPECTED = 'the Workflow type imported from @systemfsoftware/effect-cell-types' as const
export const LOCAL_TYPE_ACTUAL = 'a local `type Workflow<...>` copy of the contract' as const
export const LOCAL_TYPE_FIX =
  'delete the local copy and import { Workflow } from @systemfsoftware/effect-cell-types; a hand-rolled Workflow cannot derive the UninhabitedDecision / UninhabitedError markers' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.workflow.ts exports its decision as `export const <name> = Workflow.make(...)` — one canonical form, so the decision and error channels are always inferred from the constructor and the UninhabitedDecision / UninhabitedError markers are derived.',
  },
  schema: [Options],
  messages: {
    missingMake: DECLARATION_FORM_MESSAGE,
    annotationInsteadOfMake: DECLARATION_FORM_MESSAGE,
    localTypeDeclaration: DECLARATION_FORM_MESSAGE,
  },
} as const
