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

/**
 * The `Workflow.make(...)` decision argument. Effect Schema S.structs are inexact, so a
 * body carrying parameters, statements, and nested expressions passes the `{ type }` shape
 * while its children stay unmodeled — the boundary containment is identity, not shape.
 */
export const ArrowFunctionExpression = S.Struct({
  type: S.Literal('ArrowFunctionExpression'),
})
export type ArrowFunctionExpression = S.Schema.Type<typeof ArrowFunctionExpression>

/** A named-function decision argument, the `function (command) { … }` form of a make body. */
export const FunctionExpression = S.Struct({
  type: S.Literal('FunctionExpression'),
})
export type FunctionExpression = S.Schema.Type<typeof FunctionExpression>

/** Any AST node outside the modeled vocabulary — accepts every babel node type structurally. */
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
  /** Any expression can sit in an argument slot; the schema stays loose so exotic calls validate. */
  readonly arguments: readonly unknown[]
}

export type AstNode =
  | Identifier
  | StringLiteral
  | ArrowFunctionExpression
  | FunctionExpression
  | MemberExpression
  | CallExpression
  | UnknownNode

let AstNodeSchema: S.Schema<AstNode>

/**
 * The recursive member schemas reference the shared `AstNode` UNION directly (v4: a reference
 * straight to the schema, not a fresh `S.suspend` wrap), the same suspension layout the
 * effect-schema-ignorer kernel uses — the cycle breaks at the one union node and the schema-law
 * arbitrary derivation terminates.
 */
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
      arguments: S.Array(S.Unknown),
    }),
)

AstNodeSchema = S.Union([
  Identifier,
  StringLiteral,
  ArrowFunctionExpression,
  FunctionExpression,
  MemberExpression,
  CallExpression,
  UnknownNode,
])

export const AstNode: S.Schema<AstNode> = AstNodeSchema

export const ImportSpecifier = S.Struct({
  type: S.Literal('ImportSpecifier'),
  imported: Identifier,
  local: Identifier,
})
export type ImportSpecifier = S.Schema.Type<typeof ImportSpecifier>

export const ImportNamespaceSpecifier = S.Struct({
  type: S.Literal('ImportNamespaceSpecifier'),
  local: Identifier,
})
export type ImportNamespaceSpecifier = S.Schema.Type<typeof ImportNamespaceSpecifier>

/**
 * A specifier union admitting the named and namespace forms. A default specifier cannot bind
 * `Workflow` — `@systemfsoftware/effect-cell-types` ships no default export — so it is left
 * out and an import carrying one is not a workflow import.
 */
export const ImportDeclaration = S.Struct({
  type: S.Literal('ImportDeclaration'),
  source: StringLiteral,
  specifiers: S.Array(S.Union([ImportSpecifier, ImportNamespaceSpecifier])),
})
export type ImportDeclaration = S.Schema.Type<typeof ImportDeclaration>

/** The file root. Body holds every statement, so the element schema is intentionally loose. */
export const Program = S.Struct({
  type: S.Literal('Program'),
  body: S.Array(S.Unknown),
})
export type Program = S.Schema.Type<typeof Program>

/** Derived recognisers, declared beside the shapes they decide. */
export const isProgram = S.is(Program)
export const isImportDeclaration = S.is(ImportDeclaration)
export const isImportSpecifier = S.is(ImportSpecifier)
export const isImportNamespaceSpecifier = S.is(ImportNamespaceSpecifier)
export const isIdentifier = S.is(Identifier)
export const isStringLiteral = S.is(StringLiteral)
export const isMemberExpression = S.is(MemberExpression)
export const isCallExpression = S.is(CallExpression)
export const isArrowFunction = S.is(ArrowFunctionExpression)
export const isFunctionExpression = S.is(FunctionExpression)
