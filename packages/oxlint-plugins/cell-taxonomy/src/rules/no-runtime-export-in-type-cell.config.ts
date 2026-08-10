import type { RuleMeta } from '@oxlint/plugins'

export const TYPE_FILE = /\.type\.[cm]?ts$/

export const EXPECTED =
  'type-only exports: type aliases, interfaces, ambient (declare) declarations, and type-only re-exports' as const

export const ACTUAL = 'a runtime value export from a type cell' as const

export const FIX =
  'remove the value export, or move it into the cell that owns the behavior - a type cell exists to be imported by every cell, so a runtime export here reaches every importer' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta: RuleMeta = {
  type: 'problem',
  docs: {
    description:
      'A .type.ts file must not export runtime values (const, class, function, enum, value re-exports) - it is the declaration cell every other cell may import, so a runtime export leaks behavior into every importer.',
  },
  messages: {
    runtimeValueExport: MESSAGE,
  },
}
