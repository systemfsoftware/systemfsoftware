import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { type ImportOrigin, originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import {
  boundariesContaining,
  collectMakeBoundaries,
  isNode,
  type MakeBoundary,
  walkNodes,
} from '@systemfsoftware/oxlint-make-boundary'
import { EMPTY_VISITOR, meta } from './workflow-decides-through-match.config.js'
import { isTestFile } from './workflow-match-exhaustive.config.js'

export type MessageIds = 'unchangedSuccess' | 'tagKeyedDispatch'

type GetScope = (node: ESTree.Node) => unknown

const MATCH_MODULE = 'effect/Match'
const EFFECT_MODULE = 'effect'
const RESULT_MODULE = 'effect/Result'
/** The named export `Match` reached through the `effect` root. */
const MATCH_BINDING = 'Match'
const TAG_MEMBER = '_tag'
const MAX_ALIAS_DEPTH = 8

const MATCH_ARM_MEMBERS: Readonly<Record<string, true>> = { tag: true, when: true, orElse: true }

/** The argument slot carrying the handler callback for each `Match` arm. */
const HANDLER_ARGUMENT: Readonly<Record<string, number>> = { orElse: 0, tag: 1, when: 1 }

const TS_EXPRESSION_WRAPPERS: Readonly<Record<string, true>> = {
  TSAsExpression: true,
  TSSatisfiesExpression: true,
  TSTypeAssertion: true,
  TSNonNullExpression: true,
  TSInstantiationExpression: true,
}

const isIdentifier = (node: ESTree.Node): node is ESTree.IdentifierReference => node.type === 'Identifier'

const isExpressionWrapper = (node: ESTree.Node): node is ESTree.Node & { readonly expression: ESTree.Node } =>
  TS_EXPRESSION_WRAPPERS[node.type] === true

const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

/**
 * `Match` and `Result.succeed` are judged by import origin, never spelling: a
 * namespace alias (`import * as M from 'effect/Match'`), a named alias
 * (`import { succeed as ok }`), the `effect` root re-export and a computed
 * member all resolve to the same member of the same module.
 */
const isMatchMemberOf = (origin: ImportOrigin | null, member: string): boolean => {
  if (origin === null || originFinalMember(origin) !== member) return false
  if (origin.source === MATCH_MODULE) return true
  return origin.source === EFFECT_MODULE && origin.importedName === MATCH_BINDING
}

const isResultSucceedOf = (origin: ImportOrigin | null): boolean => {
  if (origin === null || originFinalMember(origin) !== 'succeed') return false
  if (origin.source === RESULT_MODULE) return true
  return origin.source === EFFECT_MODULE && (origin.importedName === 'Result' || origin.importedName === 'succeed')
}

const matchArmMemberOf = (callee: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(callee, getScope)
  if (origin === null) return null
  const member = originFinalMember(origin)
  if (member === null || MATCH_ARM_MEMBERS[member] !== true) return null
  return isMatchMemberOf(origin, member) ? member : null
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly {
    readonly identifier: ESTree.Node
    readonly resolved: { readonly defs: readonly DefinitionLike[] } | null
  }[]
}

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node
  readonly parent: ESTree.Node | null
  readonly name: ESTree.Node | null
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

/**
 * The defs of the variable a reference identifier resolves to, found by
 * identity in the scope tree, so a shadowing local never falls through to an
 * import of the same name (the same walk the make-boundary kernel uses).
 */
const defsOfReference = (identifier: ESTree.Node, getScope: GetScope): readonly DefinitionLike[] | null => {
  const scopeValue: unknown = getScope(identifier)
  let scope: ScopeLike | null = isScopeLike(scopeValue) ? scopeValue : null
  while (scope !== null) {
    const found = scope.references.find((reference) => reference.identifier === identifier)
    if (found !== undefined) return found.resolved === null ? null : found.resolved.defs
    scope = scope.upper
  }
  return null
}

/**
 * What a success argument denotes when it is unchanging: the name of a binding
 * it lands on, or the source text of an expression it lands on. A `const`
 * alias is followed to its initializer; `as`/`satisfies`/`<T>`/`!` wrappers are
 * transparent; a single-property spread copy `{ ...x }` denotes `x`.
 */
type Denotation =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'text'; readonly text: string }

const unchangedDenotationOf = (
  node: ESTree.Node,
  getScope: GetScope,
  getText: (node: ESTree.Node) => string,
  depth: number,
): Denotation | null => {
  if (depth > MAX_ALIAS_DEPTH) return null
  const unwrapped = unwrapExpression(node)
  if (unwrapped.type === 'ObjectExpression') {
    const properties = unwrapped.properties
    const property = properties[0]
    if (properties.length === 1 && property !== undefined && property.type === 'SpreadElement') {
      return unchangedDenotationOf(property.argument, getScope, getText, depth + 1)
    }
    return { kind: 'text', text: getText(unwrapped) }
  }
  if (!isIdentifier(unwrapped)) return { kind: 'text', text: getText(unwrapped) }
  const defs = defsOfReference(unwrapped, getScope)
  if (defs === null) return { kind: 'name', name: unwrapped.name }
  const def = defs[defs.length - 1]
  if (def === undefined || def.type !== 'Variable') return { kind: 'name', name: unwrapped.name }
  const declaration = def.parent
  if (declaration === null || declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
    return { kind: 'name', name: unwrapped.name }
  }
  const declarator = def.node
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null) {
    return { kind: 'name', name: unwrapped.name }
  }
  return unchangedDenotationOf(declarator.init, getScope, getText, depth + 1)
}

const sameDenotation = (a: Denotation, b: Denotation): boolean => {
  if (a.kind === 'name' && b.kind === 'name') return a.name === b.name
  if (a.kind === 'text' && b.kind === 'text') return a.text === b.text
  return false
}

interface HandlerFunction {
  readonly params: readonly ESTree.Node[]
  readonly body: ESTree.Node
}

const isHandlerFunction = (node: ESTree.Node): node is ESTree.Node & HandlerFunction =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'

const handlerOfArm = (armCall: ESTree.CallExpression, member: string): HandlerFunction | null => {
  const index = HANDLER_ARGUMENT[member]
  if (index === undefined) return null
  const argument = armCall.arguments[index]
  if (argument === undefined) return null
  return isHandlerFunction(argument) ? argument : null
}

/**
 * The `Match.value(subject)` expression of the pipe the arm sits in, when the
 * arm is an argument of `Match.value(...).pipe(...)`. A bare arm outside a pipe
 * has no subject beyond its own handler parameter.
 */
const subjectOfArm = (armCall: ESTree.CallExpression, getScope: GetScope): ESTree.Node | null => {
  const parent: unknown = armCall.parent
  if (!isNode(parent) || parent.type !== 'CallExpression') return null
  const callee = parent.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'pipe') return null
  const object = callee.object
  if (object.type !== 'CallExpression') return null
  if (!isMatchMemberOf(resolveImportOrigin(object.callee, getScope), 'value')) return null
  return object.arguments[0] ?? null
}

const isTagReadMember = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' &&
  node.property.name === TAG_MEMBER

/** `table[state._tag]`: a computed member keyed by a `_tag` read. */
const isTagKeyedAccess = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' && node.computed && isTagReadMember(node.property)

export const workflowDecidesThroughMatch = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return EMPTY_VISITOR
    const sourceCode = context.sourceCode
    const getScope: GetScope = sourceCode.getScope
    const getText = (node: ESTree.Node): string => sourceCode.getText(node)
    let boundaries: readonly MakeBoundary[] = []

    const reportUnchanged = (node: ESTree.Node): void => {
      context.report({
        node,
        messageId: 'unchangedSuccess',
        data: {
          name: 'Result.succeed(...) inside a Match handler',
          expected: 'a distinct success or refusal variant',
          actual: 'success wrapping the matched value unchanged',
          fix: 'construct a named variant that names the business outcome instead of returning the subject',
        },
      })
    }

    const reportTagKeyed = (node: ESTree.Node): void => {
      context.report({
        node,
        messageId: 'tagKeyedDispatch',
        data: {
          name: 'a member keyed by a _tag value',
          expected: 'Match.tag arms closed by Match.exhaustive',
          actual: 'a table lookup keyed by a state tag',
          fix: 'replace the tag-keyed lookup with Match.tag arms ended by Match.exhaustive',
        },
      })
    }

    const inspectArm = (armCall: ESTree.CallExpression, member: string): void => {
      if (boundariesContaining(armCall, boundaries).length === 0) return
      const handler = handlerOfArm(armCall, member)
      if (handler === null) return
      const denotations: Denotation[] = []
      const first = handler.params[0]
      if (first !== undefined && first.type === 'Identifier') {
        denotations.push({ kind: 'name', name: first.name })
      }
      const subject = subjectOfArm(armCall, getScope)
      if (subject !== null) {
        const subjectDenotation = unchangedDenotationOf(subject, getScope, getText, 0)
        if (subjectDenotation !== null) denotations.push(subjectDenotation)
      }
      if (denotations.length === 0) return
      walkNodes(handler.body, sourceCode.visitorKeys, (candidate) => {
        if (candidate.type !== 'CallExpression') return
        if (!isResultSucceedOf(resolveImportOrigin(candidate.callee, getScope))) return
        const argument = candidate.arguments[0]
        if (argument === undefined) return
        const denotation = unchangedDenotationOf(argument, getScope, getText, 0)
        if (denotation === null) return
        if (!denotations.some((entry) => sameDenotation(entry, denotation))) return
        reportUnchanged(candidate)
      })
    }

    return {
      Program() {
        boundaries = collectMakeBoundaries(context)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (boundaries.length === 0) return
        const member = matchArmMemberOf(node.callee, getScope)
        if (member === null) return
        inspectArm(node, member)
      },
      MemberExpression(node: ESTree.MemberExpression) {
        if (boundaries.length === 0) return
        if (!isTagKeyedAccess(node)) return
        if (boundariesContaining(node, boundaries).length === 0) return
        reportTagKeyed(node)
      },
    }
  },
})
