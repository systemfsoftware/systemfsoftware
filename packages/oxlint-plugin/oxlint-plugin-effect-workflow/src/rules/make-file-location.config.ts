import { Schema as S } from 'effect'

export const Options = S.Struct({})

/** A workflow file: one stem segment with no periods, then `.workflow.ts`. */
export const WORKFLOW_FILE_BASENAME = /^[^.]+\.workflow\.ts$/

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const OUTSIDE_EXPECTED =
  'Workflow.make constructed only in a <stem>.workflow.ts file whose stem is one segment with no periods' as const
export const OUTSIDE_ACTUAL = 'a Workflow.make call in a file that is not a single-segment <stem>.workflow.ts' as const
export const OUTSIDE_FIX =
  'move this construction into a <stem>.workflow.ts module and import the workflow from here; a workflow only a test uses belongs in tests/__fixtures__/<stem>.workflow.ts' as const

export const SECOND_EXPECTED = 'at most one Workflow.make construction per file' as const
export const SECOND_ACTUAL = 'a second Workflow.make call in the same file' as const
export const SECOND_FIX =
  'give each decision its own <stem>.workflow.ts with its __tests__/<stem>.workflow.property.test.ts beside it' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Workflow.make may be constructed only in a <stem>.workflow.ts file whose stem is one segment with no periods, and at most once per file.',
  },
  schema: [Options],
  messages: {
    makeOutsideWorkflowFile: MESSAGE,
    secondMakeInFile: MESSAGE,
  },
} as const
