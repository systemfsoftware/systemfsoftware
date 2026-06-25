import { Schema as S } from 'effect'

export const Identifier = S.Struct({
  type: S.Literal('Identifier'),
  name: S.String,
})
export type Identifier = S.Schema.Type<typeof Identifier>

export const StringLiteral = S.Struct({
  type: S.Literal('StringLiteral'),
  value: S.String,
})
export type StringLiteral = S.Schema.Type<typeof StringLiteral>

export const ObjectExpression = S.Struct({
  type: S.Literal('ObjectExpression'),
})
export type ObjectExpression = S.Schema.Type<typeof ObjectExpression>

export const UnknownNode = S.Struct({ type: S.String })
export type UnknownNode = S.Schema.Type<typeof UnknownNode>

export interface MemberExpression {
  readonly type: 'MemberExpression'
  readonly object: AstNode
  readonly property: AstNode
}

export interface CallExpression {
  readonly type: 'CallExpression'
  readonly callee: AstNode
  readonly arguments: ReadonlyArray<AstNode>
}

export type AstNode = Identifier | StringLiteral | ObjectExpression | MemberExpression | CallExpression | UnknownNode

export const MemberExpression: S.Schema<MemberExpression> = S.suspend(
  (): S.Schema<MemberExpression> =>
    S.Struct({
      type: S.Literal('MemberExpression'),
      object: S.suspend((): S.Schema<AstNode> => AstNode),
      property: S.suspend((): S.Schema<AstNode> => AstNode),
    }),
)

export const CallExpression: S.Schema<CallExpression> = S.suspend(
  (): S.Schema<CallExpression> =>
    S.Struct({
      type: S.Literal('CallExpression'),
      callee: S.suspend((): S.Schema<AstNode> => AstNode),
      arguments: S.Array(S.suspend((): S.Schema<AstNode> => AstNode)),
    }),
)

export const AstNode: S.Schema<AstNode> = S.suspend(
  (): S.Schema<AstNode> =>
    S.Union(Identifier, StringLiteral, ObjectExpression, MemberExpression, CallExpression, UnknownNode),
)
