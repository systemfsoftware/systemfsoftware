import type { RuleMeta } from '@oxlint/plugins'

export const COMBINATOR_FILE = /\.combinator\.[cm]?ts$/

export const KERNEL_IMPORT = '.kernel.js' as const

export const EXPECTED =
  'at least one import from a *.kernel.js module - a combinator is domain-typed composition over domain-blind kernels' as const

export const ACTUAL = 'a .combinator.ts file with no kernel import beneath it' as const

export const FIX =
  'import the domain-blind kernel(s) it composes, or rename the file to the cell that owns the behavior - without a kernel beneath it, the code is a schema, a workflow, or a kernel, not a combinator' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta: RuleMeta = {
  type: 'problem',
  docs: {
    description:
      'A .combinator.ts file must import at least one *.kernel.js module - a combinator is domain-typed composition over domain-blind kernels, and a combinator with no kernel beneath it is a schema, a workflow, or a kernel misfiled.',
  },
  messages: {
    kernelImportMissing: MESSAGE,
  },
}
