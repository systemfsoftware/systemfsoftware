import type {
  ArrowFunctionExpression,
  AstNode,
  CallExpression,
  Identifier,
  MemberExpression,
  Program,
} from '../../src/workflow-make-ignorer/ast-node.kernel.js'

export const identifier = (name: string): Identifier => ({ type: 'Identifier', name })

export const stringLiteral = (value: string) => ({ type: 'StringLiteral' as const, value })

export const importSpecifierOf = (imported: string, local: string) => ({
  type: 'ImportSpecifier' as const,
  imported: identifier(imported),
  local: identifier(local),
})

export const namespaceSpecifier = (local: string) => ({
  type: 'ImportNamespaceSpecifier' as const,
  local: identifier(local),
})

export const importDeclarationOf = (source: string, specifiers: readonly unknown[]) => ({
  type: 'ImportDeclaration' as const,
  source: stringLiteral(source),
  specifiers,
})

/** `import { Workflow } from '@systemfsoftware/effect-cell-types'` — the canonical production shape. */
export const workflowNamedImport = () =>
  importDeclarationOf('@systemfsoftware/effect-cell-types', [importSpecifierOf('Workflow', 'Workflow')])

/** `import { Workflow as W } from ...` — the alias keeps the same binding semantics. */
export const workflowAliasedImport = (local: string) =>
  importDeclarationOf('@systemfsoftware/effect-cell-types', [importSpecifierOf('Workflow', local)])

/** `import * as Workflow from ...` — the namespace form the boundary also honours. */
export const workflowNamespaceImport = (local: string) =>
  importDeclarationOf('@systemfsoftware/effect-cell-types', [namespaceSpecifier(local)])

/** A same-named `Workflow` coming from anywhere else must NOT open a boundary. */
export const unrelatedImport = (source: string, local: string) =>
  importDeclarationOf(source, [importSpecifierOf(local, local)])

export const programOf = (body: readonly unknown[]): Program => ({ type: 'Program', body })

export const memberOf = (object: string, property: string): MemberExpression => ({
  type: 'MemberExpression',
  object: identifier(object),
  property: identifier(property),
})

export const callOf = (callee: AstNode, args: readonly unknown[]): CallExpression => ({
  type: 'CallExpression',
  callee,
  arguments: args,
})

/** `Workflow.make(argument)` — the boundary call, when `object` names the imported local. */
export const workflowMakeCallOf = (arg: unknown, objectName = 'Workflow'): CallExpression =>
  callOf(memberOf(objectName, 'make'), [arg])

/**
 * The decision body of a `Workflow.make(...)` argument — the object that must be
 * reference-identical with the call's first argument for containment to hold.
 */
export const makeBodyOf = (inner: unknown): ArrowFunctionExpression & { readonly body: unknown } => ({
  type: 'ArrowFunctionExpression',
  body: inner,
})
