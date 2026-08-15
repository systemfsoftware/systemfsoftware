/**
 * The type-expression builder: `t` is the typed front-end for the `TypeExpr` language that
 * `type-decl.ts` defines and the shape and schema emitters render.
 *
 * A term source (a `*.term.ts` under `terms/`) is TypeScript that builds a `CellProgram` with the
 * role constructors in `cell.ts`. Where a declaration needs a type, `t` names it the way the
 * source itself would read: `t.ref('HookSession')`, `t.arrayOf(t.string)`,
 * `t.readonlyTuple([t.string, t.number])`. The value is a `TypeExpr` - data, never a string -
 * so the emitted declaration is rendered once, in the compiler, with the same rejection rules a
 * shape or schema cell gets.
 */
import type { TypeExpr } from './type-decl.ts'

/** The type expressions a term needs, named so a cell reads as TypeScript rather than as JSON. */
export const t = {
  ref: (name: string): TypeExpr => ({ ref: name }),
  string: { ref: 'string' } as TypeExpr,
  number: { ref: 'number' } as TypeExpr,
  boolean: { ref: 'boolean' } as TypeExpr,
  unknown: { ref: 'unknown' } as TypeExpr,
  void: { ref: 'void' } as TypeExpr,
  generic: (of: string, ...args: readonly TypeExpr[]): TypeExpr => ({ generic: { of, args } }),
  record: (key: TypeExpr, value: TypeExpr): TypeExpr => ({ generic: { of: 'Record', args: [key, value] } }),
  arrayOf: (of: TypeExpr): TypeExpr => ({ arrayOf: of }),
  readonlyArrayOf: (of: TypeExpr): TypeExpr => ({ readonlyArrayOf: of }),
  readonlyTuple: (head: readonly TypeExpr[], rest?: TypeExpr): TypeExpr =>
    rest === undefined ? { readonlyTuple: head } : { readonlyTuple: head, rest },
  object: (
    members: readonly { readonly name: string; readonly type: TypeExpr }[],
    options?: { readonly multiline?: boolean },
  ): TypeExpr => options?.multiline === true ? { object: members, multiline: true } : { object: members },
  union: (...members: readonly TypeExpr[]): TypeExpr => ({ union: members }),
  literal: (value: string | number | boolean): TypeExpr => ({ literal: value }),
} as const
