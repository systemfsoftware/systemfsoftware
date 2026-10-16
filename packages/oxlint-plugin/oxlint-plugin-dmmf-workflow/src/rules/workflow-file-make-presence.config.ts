import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const WITHOUT_MAKE_EXPECTED =
  'every <stem>.workflow.ts file to construct its decision with Workflow.make' as const
export const WITHOUT_MAKE_ACTUAL = 'a <stem>.workflow.ts file with no Workflow.make construction' as const
export const WITHOUT_MAKE_FIX =
  'construct the decision with Workflow.make in this file; if the file owns no decision, move the function next to its caller and drop the .workflow.ts suffix' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A <stem>.workflow.ts file constructs its decision with Workflow.make. A workflow-named file that never constructs is not a workflow file.',
  },
  schema: [Options],
  messages: {
    workflowFileWithoutMake: MESSAGE,
  },
} as const
