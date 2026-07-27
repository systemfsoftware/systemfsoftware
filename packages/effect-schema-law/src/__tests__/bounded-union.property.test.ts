import { describe, it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { boundedUnion } from '../bounded-union.js'
import { ruleOfSchemas } from '../schema.js'

interface Lit {
  readonly _tag: 'Lit'
  readonly value: number
}
interface Id {
  readonly _tag: 'Id'
  readonly name: string
}
interface Binary {
  readonly _tag: 'Binary'
  readonly op: string
  readonly left: Expr
  readonly right: Expr
}
interface Member {
  readonly _tag: 'Member'
  readonly object: Expr
  readonly property: Expr
}
interface Conditional {
  readonly _tag: 'Conditional'
  readonly test: Expr
  readonly consequent: Expr
  readonly alternate: Expr
}
interface Call {
  readonly _tag: 'Call'
  readonly callee: Expr
  readonly args: ReadonlyArray<Expr>
}
type Expr = Lit | Id | Binary | Member | Conditional | Call

const Lit = S.Struct({ _tag: S.Literal('Lit'), value: S.JsonNumber })
const Id = S.Struct({ _tag: S.Literal('Id'), name: S.String })

const Binary: S.Schema<Binary> = S.suspend((): S.Schema<Binary> =>
  S.Struct({ _tag: S.Literal('Binary'), op: S.String, left: Expr, right: Expr })
)
const Member: S.Schema<Member> = S.suspend((): S.Schema<Member> =>
  S.Struct({ _tag: S.Literal('Member'), object: Expr, property: Expr })
)
const Conditional: S.Schema<Conditional> = S.suspend((): S.Schema<Conditional> =>
  S.Struct({ _tag: S.Literal('Conditional'), test: Expr, consequent: Expr, alternate: Expr })
)
const Call: S.Schema<Call> = S.suspend((): S.Schema<Call> =>
  S.Struct({ _tag: S.Literal('Call'), callee: Expr, args: S.Array(Expr) })
)

const Expr: S.Schema<Expr> = boundedUnion('Expr', {
  base: [Lit, Id],
  recur: [Binary, Member, Conditional, Call],
})

it.prop('∀e_BoundedUnion_≤50k', [Expr], ([expr]) => JSON.stringify(expr).length < 50_000)

describe('obeys the rule of schemas', () => {
  ruleOfSchemas('Expr', Expr)
  ruleOfSchemas('Binary', Binary)
  ruleOfSchemas('Member', Member)
  ruleOfSchemas('Conditional', Conditional)
  ruleOfSchemas('Call', Call)
})
