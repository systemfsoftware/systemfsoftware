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
import { unwrap } from './ValueExports.js'
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

const MATCH_ARM_HANDLER_ARGUMENT: Readonly<Record<string, number>> = { not: 1, orElse: 0, when: 1 }

const MATCH_ARM_HANDLER_LAST: Readonly<Record<string, true>> = { tag: true, whenAnd: true, whenOr: true }

const MATCH_ARM_HANDLER_OBJECT: Readonly<Record<string, true>> = { tags: true, tagsExhaustive: true }

const isMatchArmHandlerMember = (member: string): boolean =>
  MATCH_ARM_HANDLER_ARGUMENT[member] !== undefined || MATCH_ARM_HANDLER_LAST[member] === true ||
  MATCH_ARM_HANDLER_OBJECT[member] === true

const isIdentifier = (node: ESTree.Node): node is ESTree.IdentifierReference => node.type === 'Identifier'

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
  if (member === null || !isMatchArmHandlerMember(member)) return null
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
 * What a success argument denotes when it is unchanging: the binding an
 * identifier resolves to, a member chain rooted at such a binding (the
 * `Match.value(command.state)` shape), or the source text of any other
 * expression. A `const` alias is followed to its initializer; `as`/`satisfies`
 * /`<T>`/`!` wrappers are transparent; a single-property spread copy
 * `{ ...x }` denotes `x`.
 */
type BindingDenotation = { readonly kind: 'binding'; readonly name: string; readonly identity: ESTree.Node | null }

type Denotation =
  | BindingDenotation
  | { readonly kind: 'member'; readonly name: string; readonly identity: ESTree.Node | null; readonly path: string }
  | { readonly kind: 'text'; readonly text: string }

/** The node that identifies a resolved binding for every reference to it. */
const identityOfDef = (def: DefinitionLike): ESTree.Node => def.name ?? def.node

const bindingDenotationOf = (identifier: ESTree.IdentifierReference, getScope: GetScope): BindingDenotation => {
  const defs = defsOfReference(identifier, getScope)
  const def = defs === null ? undefined : defs[defs.length - 1]
  return { kind: 'binding', name: identifier.name, identity: def === undefined ? null : identityOfDef(def) }
}

const unchangedDenotationOf = (
  node: ESTree.Node,
  getScope: GetScope,
  getText: (node: ESTree.Node) => string,
  depth: number,
): Denotation => {
  const unwrapped = unwrap(node)
  if (unwrapped.type === 'ObjectExpression') {
    const properties = unwrapped.properties
    const property = properties[0]
    if (
      properties.length === 1 && property !== undefined && property.type === 'SpreadElement' &&
      depth <= MAX_ALIAS_DEPTH
    ) {
      return unchangedDenotationOf(property.argument, getScope, getText, depth + 1)
    }
    return { kind: 'text', text: getText(unwrapped) }
  }
  if (unwrapped.type === 'MemberExpression' && !unwrapped.computed && unwrapped.property.type === 'Identifier') {
    const object = unwrap(unwrapped.object)
    if (!isIdentifier(object)) return { kind: 'text', text: getText(unwrapped) }
    const root = bindingDenotationOf(object, getScope)
    return { kind: 'member', name: root.name, identity: root.identity, path: unwrapped.property.name }
  }
  if (!isIdentifier(unwrapped)) return { kind: 'text', text: getText(unwrapped) }
  const own = bindingDenotationOf(unwrapped, getScope)
  // Past the alias cap, fail closed: degrade to the binding reached rather than
  // returning nothing, which would silently turn the check off.
  if (depth > MAX_ALIAS_DEPTH) return own
  const defs = defsOfReference(unwrapped, getScope)
  const def = defs === null ? undefined : defs[defs.length - 1]
  if (def === undefined || def.type !== 'Variable') return own
  const declaration = def.parent
  if (declaration === null || declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') return own
  const declarator = def.node
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null) return own
  return unchangedDenotationOf(declarator.init, getScope, getText, depth + 1)
}

const sameDenotation = (a: Denotation, b: Denotation): boolean => {
  if (a.kind === 'binding' && b.kind === 'binding') {
    return a.identity !== null && b.identity !== null ? a.identity === b.identity : a.name === b.name
  }
  if (a.kind === 'member' && b.kind === 'member') {
    if (a.path !== b.path) return false
    return a.identity !== null && b.identity !== null ? a.identity === b.identity : a.name === b.name
  }
  if (a.kind === 'text' && b.kind === 'text') return a.text === b.text
  return false
}

interface HandlerFunction {
  readonly params: readonly ESTree.Node[]
  readonly body: ESTree.Node
}

const isHandlerFunction = (node: ESTree.Node): node is ESTree.Node & HandlerFunction =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
  (node.type === 'FunctionDeclaration' && node.body !== null)

/** The handler a referenced binding names, when it is a same-file `const` function or declaration. */
const handlerOfReference = (reference: ESTree.IdentifierReference, getScope: GetScope): HandlerFunction | null => {
  const defs = defsOfReference(reference, getScope)
  const def = defs === null ? undefined : defs[defs.length - 1]
  if (def === undefined) return null
  if (def.type === 'FunctionName') return isHandlerFunction(def.node) ? def.node : null
  if (def.type !== 'Variable') return null
  const declaration = def.parent
  if (declaration === null || declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') return null
  const declarator = def.node
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null) return null
  return isHandlerFunction(declarator.init) ? declarator.init : null
}

const handlerOfArgument = (argument: ESTree.Node | undefined, getScope: GetScope): HandlerFunction | null => {
  if (argument === undefined) return null
  if (isHandlerFunction(argument)) return argument
  return isIdentifier(argument) ? handlerOfReference(argument, getScope) : null
}

const handlersOfArm = (
  armCall: ESTree.CallExpression,
  member: string,
  getScope: GetScope,
): readonly HandlerFunction[] => {
  if (MATCH_ARM_HANDLER_OBJECT[member] === true) {
    const argument = armCall.arguments[0]
    if (argument === undefined) return []
    const object = unwrap(argument)
    if (object.type !== 'ObjectExpression') return []
    const handlers: HandlerFunction[] = []
    for (const property of object.properties) {
      if (property.type !== 'Property') continue
      const handler = handlerOfArgument(property.value, getScope)
      if (handler !== null) handlers.push(handler)
    }
    return handlers
  }
  const index = MATCH_ARM_HANDLER_LAST[member] === true
    ? armCall.arguments.length - 1
    : MATCH_ARM_HANDLER_ARGUMENT[member]
  if (index === undefined || index < 0) return []
  const handler = handlerOfArgument(armCall.arguments[index], getScope)
  return handler === null ? [] : [handler]
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

/** `table['_tag']`: a computed member keyed by the literal tag name. */
const isTagLiteralIndex = (node: ESTree.Node): boolean =>
  node.type === 'Literal' && typeof node.value === 'string' && node.value === TAG_MEMBER

const isTagKeyedAccess = (
  node: ESTree.Node,
  getScope: GetScope,
  inBoundary: (node: ESTree.Node) => boolean,
): boolean => {
  if (node.type !== 'MemberExpression' || !node.computed) return false
  const property = unwrap(node.property)
  if (isTagReadMember(property) || isTagLiteralIndex(property)) return true
  if (!isIdentifier(property)) return false
  const defs = defsOfReference(property, getScope)
  const def = defs === null ? undefined : defs[defs.length - 1]
  if (def === undefined || def.type !== 'Variable') return false
  const declaration = def.parent
  if (declaration === null || declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') return false
  const declarator = def.node
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null || !inBoundary(declarator)) return false
  return isTagReadMember(unwrap(declarator.init))
}

export const workflowDecidesThroughMatch = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return EMPTY_VISITOR
    const sourceCode = context.sourceCode
    const getScope: GetScope = sourceCode.getScope
    const getText = (node: ESTree.Node): string => sourceCode.getText(node)
    let boundaries: readonly MakeBoundary[] = []
    const reportedUnchanged = new Set<ESTree.Node>()

    const reportUnchanged = (node: ESTree.Node): void => {
      if (reportedUnchanged.has(node)) return
      reportedUnchanged.add(node)
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
      const handlers = handlersOfArm(armCall, member, getScope)
      if (handlers.length === 0) return
      const subject = subjectOfArm(armCall, getScope)
      for (const handler of handlers) {
        const denotations: Denotation[] = []
        const first = handler.params[0]
        if (first !== undefined && first.type === 'Identifier') {
          denotations.push({ kind: 'binding', name: first.name, identity: first })
        }
        if (subject !== null) {
          denotations.push(unchangedDenotationOf(subject, getScope, getText, 0))
        }
        if (denotations.length === 0) continue
        walkNodes(handler.body, sourceCode.visitorKeys, (candidate) => {
          if (candidate.type !== 'CallExpression') return
          if (!isResultSucceedOf(resolveImportOrigin(candidate.callee, getScope))) return
          const argument = candidate.arguments[0]
          if (argument === undefined) return
          const denotation = unchangedDenotationOf(argument, getScope, getText, 0)
          if (!denotations.some((entry) => sameDenotation(entry, denotation))) return
          reportUnchanged(candidate)
        })
      }
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
        if (boundariesContaining(node, boundaries).length === 0) return
        if (!isTagKeyedAccess(node, getScope, (candidate) => boundariesContaining(candidate, boundaries).length > 0)) {
          return
        }
        reportTagKeyed(node)
      },
    }
  },
})
