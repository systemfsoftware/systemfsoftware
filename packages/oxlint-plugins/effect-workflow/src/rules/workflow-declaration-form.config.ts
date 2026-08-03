import { Schema as S } from 'effect'

export const Options = S.Struct({})
export type Options = S.Schema.Type<typeof Options>

export const DECLARATION_FORM_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const WORKFLOW_TYPE_NAME = 'Workflow' as const

export const FUNCTION_DECLARATION_EXPECTED =
  'export const <name>: Workflow<Command, Decision, Error> = (command) => ...' as const
export const FUNCTION_DECLARATION_ACTUAL = 'an export function declaration' as const
export const FUNCTION_DECLARATION_FIX =
  'rewrite as an annotated const. A function declaration has nowhere to carry the Workflow<...> annotation, so the compiler never checks the contract and the cell degrades to a filename' as const

export const MISSING_ANNOTATION_EXPECTED = 'a Workflow<Command, Decision, Error> type annotation on the const' as const
export const MISSING_ANNOTATION_ACTUAL = 'an unannotated const' as const
export const MISSING_ANNOTATION_FIX =
  'annotate it: `export const {{name}}: Workflow<Cmd, Decision, Error> = ...`. Without the annotation tsc infers whatever the body happens to return and the both-channels-inhabited contract goes unchecked' as const

export const WRONG_ANNOTATION_EXPECTED = 'Workflow<Command, Decision, Error>' as const
export const WRONG_ANNOTATION_ACTUAL = 'a type annotation that is not Workflow<...>' as const
export const WRONG_ANNOTATION_FIX =
  'a *.workflow.ts export states its contract as Workflow<Cmd, Decision, Error> from @systemfsoftware/effect-cell-types; any other annotation leaves the cell unverified' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.workflow.ts exports its decision as `export const <name>: Workflow<C, D, E> = ...` — one canonical form, so the type contract is always present for tsc to check.',
  },
  schema: [Options],
  messages: {
    functionDeclaration: DECLARATION_FORM_MESSAGE,
    missingAnnotation: DECLARATION_FORM_MESSAGE,
    wrongAnnotation: DECLARATION_FORM_MESSAGE,
  },
} as const
