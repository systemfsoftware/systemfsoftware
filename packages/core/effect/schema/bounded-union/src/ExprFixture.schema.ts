import { Schema as S } from 'effect'

export const BinaryBase = S.TaggedStruct('Binary', { op: S.String })
export const MemberBase = S.TaggedStruct('Member', {})
export const ConditionalBase = S.TaggedStruct('Conditional', {})
export const CallBase = S.TaggedStruct('Call', {})

export const Lit = S.TaggedStruct('Lit', { value: S.Finite })
export const Id = S.TaggedStruct('Id', { name: S.String })

export type Binary = S.Schema.Type<typeof BinaryBase> & { readonly left: Expr; readonly right: Expr }
export type Member = S.Schema.Type<typeof MemberBase> & { readonly object: Expr; readonly property: Expr }
export type Conditional = S.Schema.Type<typeof ConditionalBase> & {
  readonly test: Expr
  readonly consequent: Expr
  readonly alternate: Expr
}
export type Call = S.Schema.Type<typeof CallBase> & { readonly callee: Expr; readonly args: readonly Expr[] }
export type Lit = S.Schema.Type<typeof Lit>
export type Id = S.Schema.Type<typeof Id>

export type Expr = Lit | Id | Binary | Member | Conditional | Call
