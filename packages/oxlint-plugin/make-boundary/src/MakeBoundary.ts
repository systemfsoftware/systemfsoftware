import type { Context, ESTree } from '@oxlint/plugins'
import {
  type ImportOrigin,
  originFinalMember,
  originFirstMember,
  resolveImportOrigin,
} from '@systemfsoftware/oxlint-import-origin'

/**
 * The module whose `Workflow` value owns the constructor boundary — the declared
 * members `make`, `total`, and `andThen`. Mirrors the stryker-plugins
 * workflow-make-ignorer constants; the oxlint package cannot import the stryker
 * package, so the three constants are declared here.
 */
export const WORKFLOW_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The import name a specifier must carry to be the workflow value. */
export const WORKFLOW_IMPORT_NAME = 'Workflow' as const

/**
 * The members of the workflow value that construct a workflow: `make` (the
 * decision with an error channel), `total` (the decision that cannot fail), and
 * `andThen` (the composite that wires one workflow's decision output into the
 * next workflow's command). Declared once, as a set: every make-keyed rule
 * locates the boundary through this kernel, so a constructor added to the
 * workflow value is added here and no rule goes dark on it.
 *
 * The documented bound: the member is read from the import origin of the call's
 * callee, resolved in THIS file. A constructor reached through a re-export chain
 * — a module that re-exports the workflow value and is imported in its place —
 * has a different source, so it is not a boundary this kernel can see.
 */
export const WORKFLOW_CONSTRUCTOR_MEMBERS: Readonly<Record<string, true>> = {
  make: true,
  total: true,
  andThen: true,
}

/**
 * The members whose signature takes constructed workflows in place of a decider:
 * an `andThen` construction holds no decision body in the file that opens it, so
 * a body-scoped rule demands nothing there. Every other constructor is presumed
 * to take one — a member added above without this line keeps its body checked.
 */
const COMPOSING_MEMBERS: Readonly<Record<string, true>> = { andThen: true }

type FunctionLike = ESTree.Function & { readonly type: 'FunctionDeclaration' | 'FunctionExpression' }

export type MakeBodyKind = ESTree.ArrowFunctionExpression | FunctionLike

/**
 * A located workflow construction boundary — a `Workflow.make`, `Workflow.total`,
 * or `Workflow.andThen` call. `resolvedBody` is the decider body when the decider
 * is a function written inline or a module-scope function reference resolved in the
 * same file; it is `null` when the body cannot be located from this file's AST (an
 * imported decision, a call with no function argument at all). A `null` body is a
 * finding the caller reports when `takesDeciderBody` is true, and nothing to report
 * when it is false — a composing constructor holds no decision body to find.
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
  readonly takesDeciderBody: boolean
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

export const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value

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

const TS_NODES_THAT_HOLD_A_VALUE: Readonly<Record<string, true>> = {
  TSAbstractAccessorProperty: true,
  TSAbstractMethodDefinition: true,
  TSAbstractPropertyDefinition: true,
  TSAsExpression: true,
  TSEnumDeclaration: true,
  TSEnumMember: true,
  TSExportAssignment: true,
  TSExternalModuleReference: true,
  TSImportEqualsDeclaration: true,
  TSInstantiationExpression: true,
  TSModuleBlock: true,
  TSModuleDeclaration: true,
  TSNonNullExpression: true,
  TSParameterProperty: true,
  TSSatisfiesExpression: true,
  TSTypeAssertion: true,
}

/**
 * The house AST walk, shared by every rule that reads a file's nodes: the nodes
 * that are not inside a type-only subtree. A node whose type starts with `TS` and
 * which cannot hold a value IS type syntax — the node itself is visited, so a rule
 * may read the declaration it opens, but its contents are not: a `new X()` or an
 * `X.make(…)` written in a type position probes a type and is erased before
 * anything runs, so no rule may read it as a construction.
 */
export const walkNodes = (
  root: unknown,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
  visit: (n: ESTree.Node) => void,
): void => {
  const step = (value: unknown): void => {
    const node = isNode(value) ? value : null
    if (node === null) return
    visit(node)
    const isTypeSyntax = node.type.startsWith('TS') && TS_NODES_THAT_HOLD_A_VALUE[node.type] !== true
    if (isTypeSyntax) return
    const record = isWalkable(node) ? node : null
    if (record === null) return
    for (const key of visitorKeys[node.type] ?? []) {
      const child = record[key]
      if (Array.isArray(child)) {
        for (const entry of child) step(entry)
      } else {
        step(child)
      }
    }
  }
  step(root)
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

const isConstructorMember = (member: string | null): boolean =>
  member !== null && WORKFLOW_CONSTRUCTOR_MEMBERS[member] === true

const isComposingMember = (member: string | null): boolean => member !== null && COMPOSING_MEMBERS[member] === true

const isMakeBoundaryOrigin = (origin: ImportOrigin): boolean => {
  if (!isWorkflowModuleSpecifier(origin.source)) return false
  if (!isConstructorMember(originFinalMember(origin))) return false
  const firstMember = originFirstMember(origin)
  return isConstructorMember(firstMember) || firstMember === WORKFLOW_IMPORT_NAME
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
 * Every workflow construction call in the file — any declared constructor member
 * — shadow-correct: a local rebinding of the name is not the boundary, and an
 * alias that resolves back to the workflow import is. The callee is judged by its
 * import origin, never its spelling, so computed members, aliases, destructuring
 * and bind/apply/call indirections all count. The body is the argument function
 * when it is inline or a same-file reference; otherwise `resolvedBody` is `null`,
 * and `takesDeciderBody` carries whether this constructor takes one at all.
 *
 * A call in a type position is a probe of a type, erased before anything runs, so
 * it is not a construction and yields no boundary.
 */
export const collectMakeBoundaries = (context: Context): readonly MakeBoundary[] => {
  const boundaries: MakeBoundary[] = []
  const visitorKeys = context.sourceCode.visitorKeys
  walkNodes(context.sourceCode.ast, visitorKeys, (node) => {
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
    boundaries.push({
      makeCall: node,
      resolvedBody,
      commandArgument: constructionArguments[0] ?? null,
      takesDeciderBody: !isComposingMember(originFinalMember(origin)),
    })
  })
  return boundaries
}

export const hasMakeBoundary = (context: Context): boolean => collectMakeBoundaries(context).length > 0

/** True when `node` descends from (or is) the body — the argument-slot containment test. */
export const isWithinBody = (node: ESTree.Node, body: MakeBodyKind): boolean =>
  node.start >= body.start && node.end <= body.end

/** Every boundary whose resolved body contains the node; `null` bodies contain nothing. */
export const boundariesContaining = (
  node: ESTree.Node,
  boundaries: readonly MakeBoundary[],
): readonly MakeBoundary[] =>
  boundaries.filter((boundary) => boundary.resolvedBody !== null && isWithinBody(node, boundary.resolvedBody))
