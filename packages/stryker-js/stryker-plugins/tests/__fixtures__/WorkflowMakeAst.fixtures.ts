interface Identifier {
  readonly type: 'Identifier'
  readonly name: string
}

interface MemberExpression {
  readonly type: 'MemberExpression'
  readonly object: Identifier
  readonly property: Identifier
}

interface CallExpression {
  readonly type: 'CallExpression'
  readonly callee: AstNode
  readonly arguments: readonly unknown[]
}

interface ArrowFunctionExpression {
  readonly type: 'ArrowFunctionExpression'
  readonly body: unknown
}

interface Program {
  readonly type: 'Program'
  readonly body: readonly unknown[]
}

interface StringLiteral {
  readonly type: 'Literal'
  readonly value: string
}

type AstNode = unknown

export const identifier = (name: string): Identifier => ({ type: 'Identifier', name })

export const stringLiteral = (value: string): StringLiteral => ({ type: 'Literal', value })

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
 * `Workflow.make(Command, argument)` — the two-argument boundary call. The
 * command schema class occupies slot 0 and the decider slot 1, so a resolver
 * pinned to slot 0 finds a class, resolves no function, and silently drops the
 * referenced decision body out of the mutation population.
 */
export const workflowMakeCallOfTwo = (
  command: unknown,
  arg: unknown,
  objectName = 'Workflow',
): CallExpression => callOf(memberOf(objectName, 'make'), [command, arg])

/** `class <name> {}` — a command class in slot 0; never a decision body. */
export const classDeclarationOf = (name: string) => ({
  type: 'ClassDeclaration' as const,
  id: identifier(name),
  body: { type: 'ClassBody' as const, body: [] },
})

/**
 * The decision body of a `Workflow.make(...)` argument — the object that must be
 * reference-identical with the call's first argument for containment to hold.
 */
export const makeBodyOf = (inner: unknown): ArrowFunctionExpression & { readonly body: unknown } => ({
  type: 'ArrowFunctionExpression',
  body: inner,
})

/**
 * `const <name> = <init>` — a module-scope binding a `Workflow.make` identifier
 * argument can resolve to. The declarator layer is elided: the parser's ancestry
 * goes body -> declarator -> declaration, and the kernels model the statement.
 */
export const constBindingOf = (name: string, init: unknown) => ({
  type: 'VariableDeclaration',
  kind: 'const',
  declarations: [{ type: 'VariableDeclarator', id: identifier(name), init }],
})
