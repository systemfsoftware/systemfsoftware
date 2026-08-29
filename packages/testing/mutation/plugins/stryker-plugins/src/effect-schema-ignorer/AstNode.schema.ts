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

/**
 * The recursive member schemas reference the shared `AstNode` UNION directly
 * (v4: a reference straight to the schema, not a fresh `S.suspend` wrap). The
 * v4 arbitrary derivation declares a recursion "finite" when every cycle passes
 * through a suspend node that appears in its recursion stack; a field suspend
 * layered in front of the top-level suspend double-wraps the same node and
 * loses that boundary, which made the schema-law encoded-arbitrary fail with
 * "recursive schema without a finite generation path". Keeping the union node
 * shared and letting `MemberExpression`/`CallExpression` suspend at the top is
 * also the v4 Schema document's own recursive-schema shape (fields reference
 * the schema, the cycle breaks at the one suspension).
 */
let AstNodeSchema: S.Schema<AstNode>

export const MemberExpression: S.Schema<MemberExpression> = S.suspend(
  (): S.Schema<MemberExpression> =>
    S.Struct({
      type: S.Literal('MemberExpression'),
      object: AstNodeSchema,
      property: AstNodeSchema,
    }),
)

export const CallExpression: S.Schema<CallExpression> = S.suspend(
  (): S.Schema<CallExpression> =>
    S.Struct({
      type: S.Literal('CallExpression'),
      callee: AstNodeSchema,
      arguments: S.Array(AstNodeSchema),
    }),
)

AstNodeSchema = S.Union([
  Identifier,
  StringLiteral,
  ObjectExpression,
  ArrowFunctionExpression,
  MemberExpression,
  CallExpression,
  UnknownNode,
])

export const AstNode: S.Schema<AstNode> = AstNodeSchema

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
