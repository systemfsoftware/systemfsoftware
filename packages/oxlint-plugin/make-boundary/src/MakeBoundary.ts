import type { Context, ESTree } from '@oxlint/plugins'
import { type ImportOrigin, originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'

/**
 * The module whose `Workflow` value owns the `make` boundary. Mirrors the
 * stryker-plugins workflow-make-ignorer constants; the oxlint package cannot
 * import the stryker package, so the three constants are declared here.
 */
export const WORKFLOW_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The import name a specifier must carry to be the workflow value. */
export const WORKFLOW_IMPORT_NAME = 'Workflow' as const

/** The member of the workflow value the boundary call invokes. */
export const MAKE_MEMBER_NAME = 'make' as const

type FunctionLike = ESTree.Function & { readonly type: 'FunctionDeclaration' | 'FunctionExpression' }

export type MakeBodyKind = ESTree.ArrowFunctionExpression | FunctionLike

/**
 * A located `Workflow.make(...)` decision boundary. `resolvedBody` is the
 * decider body when the decider is a function written inline or a
 * module-scope function reference resolved in the same file; it is `null`
 * when the body cannot be located from this file's AST (an imported
 * decision, a call with no function argument at all). A `null` body is a
 * finding the caller reports, never a silent skip.
 *
 * `commandArgument` is the schema-class position — the first construction
 * argument, after the `call`/`apply` shift. It is a slot rather than a shape
 * because that is what the signature says: `make` takes the command first and
 * the decider second. It is `null` when the call passes no such argument, which
 * the compiler already refuses; a rule reading it stays silent there rather
 * than reporting a second time.
 */
export interface MakeBoundary {
  readonly makeCall: ESTree.CallExpression
  readonly resolvedBody: MakeBodyKind | null
  readonly commandArgument: ESTree.Node | null
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly DefinitionLike[] }>
  readonly references: readonly {
    readonly identifier: ESTree.Node
    readonly resolved: { readonly defs: readonly DefinitionLike[] } | null
  }[]
}

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node
  readonly parent: ESTree.Node | null
}

type IdentifierNode = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }
type MemberExpressionNode = ESTree.Node & {
  readonly type: 'MemberExpression'
  readonly object: ESTree.Node
  readonly property: ESTree.Node
  readonly computed: boolean
}

const isNode = (value: unknown): value is ESTree.Node => typeof value === 'object' && value !== null && 'type' in value

const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

const isIdentifier = (node: ESTree.Node): node is IdentifierNode => node.type === 'Identifier'

const isMemberExpression = (node: ESTree.Node): node is MemberExpressionNode => node.type === 'MemberExpression'

const isCallExpression = (node: ESTree.Node): node is ESTree.CallExpression => node.type === 'CallExpression'

const isArrowFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression =>
  node.type === 'ArrowFunctionExpression'

const isFunctionLike = (node: ESTree.Node): node is FunctionLike =>
  node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'

const isVariableDeclarator = (node: ESTree.Node): node is ESTree.VariableDeclarator =>
  node.type === 'VariableDeclarator'

const isVariableDeclaration = (node: ESTree.Node): node is ESTree.VariableDeclaration =>
  node.type === 'VariableDeclaration'

const walk = (
  root: unknown,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
  visit: (n: ESTree.Node) => void,
): void => {
  const node = isNode(root) ? root : null
  if (node === null) return
  visit(node)
  const record = isWalkable(node) ? node : null
  if (record === null) return
  for (const key of visitorKeys[node.type] ?? []) {
    const value = record[key]
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isNode(entry)) walk(entry, visitorKeys, visit)
      }
    } else if (isNode(value)) {
      walk(value, visitorKeys, visit)
    }
  }
}

/**
 * The variable a reference identifier resolves to: the reference's own
 * `resolved` binding, found by identity in the scope tree. Name-based scope
 * lookups merge same-scope re-declarations (an import plus a shadowing const
 * collapse into one variable), so only the reference knows the shadow.
 */
const variableOfReference = (
  identifier: IdentifierNode,
  getScope: (node: ESTree.Node) => unknown,
): { readonly defs: readonly DefinitionLike[] } | null => {
  const scopeValue: unknown = getScope(identifier)
  let scope: ScopeLike | null = isScopeLike(scopeValue) ? scopeValue : null
  while (scope !== null) {
    const found = scope.references.find((reference) => reference.identifier === identifier)
    if (found !== undefined && found.resolved !== null) {
      return { defs: found.resolved.defs }
    }
    if (found !== undefined) return null
    scope = scope.upper
  }
  return null
}

/**
 * The package that defines `Workflow` imports it relatively, so a resolver keyed only on the
 * package specifier is blind inside that package — the one place the primitive is authored.
 * Measured 2026-08-17: `canonical-decide.workflow.ts` names `Workflow.make` and every
 * make-boundary rule reported nothing there, so its green was unearned.
 */
const RELATIVE_WORKFLOW_MODULE = /(?:^|\/)Workflow\.js$/

const isWorkflowModuleSpecifier = (source: string): boolean =>
  source === WORKFLOW_SOURCE || (source.startsWith('.') && RELATIVE_WORKFLOW_MODULE.test(source))

/**
 * Whether a callee origin denotes a `Workflow.make` construction: the origin
 * must reach the workflow module and its member sequence must end in `make`.
 * Two seed shapes count — the sequence starts with the `Workflow` binding
 * (`Workflow.make`, `const W = Workflow; W.make(...)`, a computed
 * `Workflow['make']`, a chain of aliases, a member path taken off the value)
 * or the sequence is exactly the `make` member (a namespace import's member,
 * a destructured `const { make } = Workflow`, a `const m = Workflow.make`
 * alias, or a direct `import { make }`). A `make` reached through any other
 * binding of the same module is not the workflow construction.
 */
const isMakeBoundaryOrigin = (origin: ImportOrigin): boolean => {
  if (!isWorkflowModuleSpecifier(origin.source)) return false
  const sequence = originMemberSequence(origin)
  if (sequence[sequence.length - 1] !== MAKE_MEMBER_NAME) return false
  return sequence[0] === MAKE_MEMBER_NAME || sequence[0] === WORKFLOW_IMPORT_NAME
}

/**
 * The follow-the-reference walk: a module-scope function handed to `make` by
 * name is resolved to its declaration in the same file, with an alias chain
 * bounded against cycles. Anything else is genuinely unresolvable from this
 * file's AST and stays `null` — the caller reports it.
 */
const followIdentifier = (
  identifier: IdentifierNode,
  getScope: (node: ESTree.Node) => unknown,
  depth: number,
): MakeBodyKind | null => {
  if (depth > 8) return null
  const variable = variableOfReference(identifier, getScope)
  if (variable === null) return null
  for (const def of variable.defs) {
    if (def.type === 'FunctionName' && isFunctionLike(def.node)) return def.node
    if (def.type !== 'Variable') continue
    const declaration = def.parent
    if (declaration === null || !isVariableDeclaration(declaration) || declaration.kind !== 'const') continue
    if (!isVariableDeclarator(def.node)) continue
    const init = def.node.init
    if (init === null) continue
    if (isArrowFunction(init) || isFunctionLike(init)) return init
    if (isIdentifier(init)) return followIdentifier(init, getScope, depth + 1)
  }
  return null
}

/**
 * Every `Workflow.make(...)` call in the file — shadow-correct: a local
 * rebinding of the name is not the boundary, and an alias that resolves back
 * to the workflow import is. The callee is judged by its import origin, never
 * its spelling, so computed members, aliases, destructuring and
 * bind/apply/call indirections all count. The body is the argument function
 * when it is inline or a same-file reference; otherwise `resolvedBody` is
 * `null`.
 */
export const collectMakeBoundaries = (context: Context): readonly MakeBoundary[] => {
  const boundaries: MakeBoundary[] = []
  const visitorKeys = context.sourceCode.visitorKeys
  walk(context.sourceCode.ast, visitorKeys, (node) => {
    if (!isCallExpression(node)) return
    const origin = resolveImportOrigin(node.callee, context.sourceCode.getScope)
    if (origin === null || !isMakeBoundaryOrigin(origin)) return
    // The construction is the call that INVOKES the make function, and its own
    // argument list is not always the call's. `make.bind(...)` is a partial
    // application - its arguments are the this-bound target, not the decision body -
    // so the construction is the later call of the bound value. `make.call(this, a, b)`
    // invokes make directly and shifts every construction argument one slot later.
    // `make.apply(this, [a, b])` invokes it too, but puts the whole list inside an
    // array: reading slot 1 there yields the array, so the command position resolved
    // to an ArrayExpression the rules cannot classify and the body search found no
    // function - both layers silently dark on a real construction.
    const callee = node.callee
    let constructionArguments: readonly (ESTree.Node | null)[] = node.arguments
    if (isMemberExpression(callee) && !callee.computed && callee.property.type === 'Identifier') {
      const memberName = callee.property.name
      if (memberName === 'bind') return
      if (memberName === 'call') constructionArguments = node.arguments.slice(1)
      if (memberName === 'apply') {
        const list = node.arguments[1]
        // A spread or a non-literal list is unreadable from the AST; there is no
        // argument list to judge, so the boundary carries none rather than guessing.
        constructionArguments = list !== undefined && list.type === 'ArrayExpression' ? list.elements : []
      }
    }
    // The decider is found by SHAPE, never by slot index: `make` takes the
    // command schema class first and the decider second, and a locator pinned
    // to one slot resolves the class, yields no body, and turns every
    // body-scoped rule silently dark. Search forward and take the first
    // argument that resolves to a function.
    let resolvedBody: MakeBodyKind | null = null
    for (const argument of constructionArguments) {
      if (argument === null) continue
      if (isArrowFunction(argument) || isFunctionLike(argument)) {
        resolvedBody = argument
        break
      }
      if (isIdentifier(argument)) {
        const followed = followIdentifier(argument, context.sourceCode.getScope, 0)
        if (followed !== null) {
          resolvedBody = followed
          break
        }
      }
    }
    boundaries.push({ makeCall: node, resolvedBody, commandArgument: constructionArguments[0] ?? null })
  })
  return boundaries
}

export const hasMakeBoundary = (context: Context): boolean => {
  let found = false
  walk(context.sourceCode.ast, context.sourceCode.visitorKeys, (node) => {
    if (found || !isCallExpression(node)) return
    const origin = resolveImportOrigin(node.callee, context.sourceCode.getScope)
    if (origin !== null && isMakeBoundaryOrigin(origin)) found = true
  })
  return found
}

/** True when `node` descends from (or is) the body — the argument-slot containment test. */
export const isWithinBody = (node: ESTree.Node, body: MakeBodyKind): boolean =>
  node.start >= body.start && node.end <= body.end

/** Every boundary whose resolved body contains the node; `null` bodies contain nothing. */
export const boundariesContaining = (
  node: ESTree.Node,
  boundaries: readonly MakeBoundary[],
): readonly MakeBoundary[] =>
  boundaries.filter((boundary) => boundary.resolvedBody !== null && isWithinBody(node, boundary.resolvedBody))
