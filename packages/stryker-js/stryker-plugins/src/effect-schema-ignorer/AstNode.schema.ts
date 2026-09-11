import { Schema as S } from 'effect'

export const Identifier = S.Struct({
  type: S.Literal('Identifier'),
  name: S.String,
})
export type Identifier = S.Schema.Type<typeof Identifier>

// ESTree renders string literals as Literal{value:string}; the semantic name records what this matches.
export const StringLiteral = S.Struct({
  type: S.Literal('Literal'),
  value: S.String,
})
export type StringLiteral = S.Schema.Type<typeof StringLiteral>

export const ObjectExpression = S.Struct({
  type: S.Literal('ObjectExpression'),
})
export type ObjectExpression = S.Schema.Type<typeof ObjectExpression>

export const ArrowFunctionExpression = S.Struct({
  type: S.Literal('ArrowFunctionExpression'),
})
export type ArrowFunctionExpression = S.Schema.Type<typeof ArrowFunctionExpression>

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
  readonly arguments: readonly AstNode[]
}

export type AstNode =
  | Identifier
  | StringLiteral
  | ObjectExpression
  | ArrowFunctionExpression
  | MemberExpression
  | CallExpression
  | UnknownNode

export const AstNode: S.Schema<AstNode> = S.suspend(
  (): S.Schema<AstNode> =>
    S.Union([
      Identifier,
      StringLiteral,
      ObjectExpression,
      ArrowFunctionExpression,
      MemberExpression,
      CallExpression,
      UnknownNode,
    ]),
).annotate({
  identifier: 'systemfsoftware.stryker-plugins.effect-schema-ignorer.AstNode',
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
})

export const MemberExpression: S.Schema<MemberExpression> = S.Struct({
  type: S.Literal('MemberExpression'),
  object: AstNode,
  property: AstNode,
})

export const CallExpression: S.Schema<CallExpression> = S.Struct({
  type: S.Literal('CallExpression'),
  callee: AstNode,
  arguments: S.Array(AstNode),
})

export const DocumentationKey = S.Literals(['identifier', 'description', 'title', 'documentation', 'examples'])

export const DocumentationProperty = S.Struct({
  type: S.Literal('Property'),
  computed: S.Literal(false),
  key: S.Union([
    S.Struct({ type: S.Literal('Identifier'), name: DocumentationKey }),
    S.Struct({ type: S.Literal('Literal'), value: DocumentationKey }),
  ]),
  value: S.Unknown,
})

export const DocumentationObject = S.Struct({
  type: S.Literal('ObjectExpression'),
  properties: S.NonEmptyArray(DocumentationProperty),
})

/** Derived recognisers, declared beside the shapes they decide. */
export const isIdentifier = S.is(Identifier)
export const isStringLiteral = S.is(StringLiteral)
export const isObjectExpression = S.is(ObjectExpression)
export const isArrowFunctionExpression = S.is(ArrowFunctionExpression)
export const isMemberExpression = S.is(MemberExpression)
export const isCallExpression = S.is(CallExpression)
export const isDocumentationProperty = S.is(DocumentationProperty)
export const isDocumentationObject = S.is(DocumentationObject)
