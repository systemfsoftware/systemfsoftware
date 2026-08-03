import { MESSAGE } from './path.config.js'

export const PURE_CELL_IMPORT_NAME = 'a *.integration.test.ts importing a pure cell directly' as const
export const PURE_CELL_IMPORT_EXPECTED =
  'the use case that composes the cell — its executor/handler — reached the way production reaches it' as const
export const PURE_CELL_IMPORT_ACTUAL =
  'a direct import of a .kernel/.workflow/.schema/.acl module from a behaviour test' as const
export const PURE_CELL_IMPORT_FIX =
  'before moving this assertion anywhere, ask what bug it could catch. A pure cell is proven by the type system and exercised through whatever composes it. If the assertion restates a literal from the cell under test — a lookup-table entry, a constant, a mapping — it is a change detector, not a test: delete it. If it states an invariant that holds over generated inputs, it becomes a *.property.test.ts beside a workflow, policy, or schema cell. A kernel gets neither: it is domain-blind and carries no invariant of its own.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.integration.test.ts must not import a pure cell (kernel, workflow, schema, acl) directly; pure cells are proven by property tests colocated in src/ and reached at composition altitude only through the shell that drives them.',
  },
  schema: [],
  messages: {
    pureCellImport: MESSAGE,
  },
} as const
