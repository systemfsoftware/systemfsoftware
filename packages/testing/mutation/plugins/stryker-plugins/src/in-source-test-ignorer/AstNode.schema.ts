import { Schema as S } from 'effect'

export const Identifier = S.Struct({
  type: S.Literal('Identifier'),
  name: S.String,
})
export type Identifier = S.Schema.Type<typeof Identifier>

export const AstLike = S.Struct({ type: S.String })
export type AstLike = S.Schema.Type<typeof AstLike>

export const MetaProperty = S.Struct({
  type: S.Literal('MetaProperty'),
  meta: Identifier,
  property: Identifier,
})
export type MetaProperty = S.Schema.Type<typeof MetaProperty>

export const ImportMetaMember = S.Struct({
  type: S.Literal('MemberExpression'),
  object: MetaProperty,
  property: Identifier,
})
export type ImportMetaMember = S.Schema.Type<typeof ImportMetaMember>

export const BinaryExpression = S.Struct({
  type: S.Literal('BinaryExpression'),
  left: AstLike,
  right: AstLike,
})
export type BinaryExpression = S.Schema.Type<typeof BinaryExpression>

export const IfStatement = S.Struct({
  type: S.Literal('IfStatement'),
  test: AstLike,
})
export type IfStatement = S.Schema.Type<typeof IfStatement>

/** Derived recognisers, declared beside the shapes they decide. */
export const isImportMetaMember = S.is(ImportMetaMember)
export const isBinaryExpression = S.is(BinaryExpression)
export const isIfStatement = S.is(IfStatement)
