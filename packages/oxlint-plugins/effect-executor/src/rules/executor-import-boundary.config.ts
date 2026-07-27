import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ADAPTER_VALUE_IMPORT_ACTUAL = 'a value import of the .adapter cell' as const
export const ADAPTER_VALUE_IMPORT_EXPECTED = 'type-only imports of adapter modules' as const
export const ADAPTER_VALUE_IMPORT_FIX =
  "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root" as const

export const SHAPE_IMPORT_ACTUAL = 'an import of the .shape cell' as const
export const SHAPE_IMPORT_EXPECTED = 'domain vocabulary only' as const
export const SHAPE_IMPORT_FIX = 'go through the *.acl.ts — the ACL is the only licensed foreign-to-domain hop' as const

export const EXECUTOR_IMPORT_ACTUAL = 'an import of the .executor cell' as const
export const EXECUTOR_IMPORT_EXPECTED = 'one operation per executor' as const
export const EXECUTOR_IMPORT_FIX =
  'give the composite operation its own executor whose sandwich reads what both decisions need' as const

export const ADAPTER_VALUE_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const SHAPE_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXECUTOR_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Enforce the import boundary in *.executor.ts: type-only adapter borrows, never shape, never another executor.',
  },
  schema: [Options],
  messages: {
    adapterValueImport: ADAPTER_VALUE_IMPORT_MESSAGE,
    shapeImport: SHAPE_IMPORT_MESSAGE,
    executorImport: EXECUTOR_IMPORT_MESSAGE,
  },
} as const
