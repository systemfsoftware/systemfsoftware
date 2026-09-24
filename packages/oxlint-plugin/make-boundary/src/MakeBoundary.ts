import type { Context, ESTree } from '@oxlint/plugins'
import {
  type ImportOrigin,
  originFinalMember,
  originFirstMember,
  resolveImportOrigin,
} from '@systemfsoftware/oxlint-import-origin'

/**
 * The module whose `Workflow` value owns the constructor boundary — the single
 * declared member `make`. Mirrors the stryker-plugins workflow-make-ignorer
 * constants; the oxlint package cannot import the stryker package, so the
 * constants are declared here.
 */
export const WORKFLOW_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The import name a specifier must carry to be the workflow value. */
export const WORKFLOW_IMPORT_NAME = 'Workflow' as const

/** The options-object property carrying the decision body. */
const DECIDE_PROPERTY = 'decide' as const

/** The options-object property carrying the command schema. */
const COMMAND_PROPERTY = 'command' as const

/**
 * The members of the workflow value that construct a workflow: `make`, the one
 * constructor, taking an options object `{ command, decision, error, decide }`.
 * Declared once, as a set: every make-keyed rule locates the boundary through
 * this kernel, so a constructor added to the workflow value is added here and no
 * rule goes dark on it.
 *
 * The documented bound: the member is read from the import origin of the call's
 * callee, resolved in THIS file. A constructor reached through a re-export chain
 * — a module that re-exports the workflow value and is imported in its place —
 * has a different source, so it is not a boundary this kernel can see.
 */
export const WORKFLOW_CONSTRUCTOR_MEMBERS: Readonly<Record<string, true>> = {
  make: true,
}

type FunctionLike = ESTree.Function & { readonly type: 'FunctionDeclaration' | 'FunctionExpression' }

export type MakeBodyKind = ESTree.ArrowFunctionExpression | FunctionLike

/**
 * A located workflow construction boundary — a `Workflow.make` call. `resolvedBody`
 * is the decider body, read from the `decide` property of the single options
 * object argument: an inline function, or a module-scope function reference
 * resolved in the same file, including a shorthand property. It is `null` when
 * the decision cannot be located from this file's AST (a missing `decide`
 * property, an imported decision, a value that is neither a function nor a
 * resolvable reference), which the caller reports.
 *
 * `commandProperty` is the `command` property of that same options object — the
 * schema-class position the compiler checks. It is `null` when the object
 * carries no `command` property, which the compiler already refuses; a rule
 * reading it stays silent there rather than reporting a second time.
 */
export interface MakeBoundary {
  readonly makeCall: ESTree.CallExpression
  readonly resolvedBody: MakeBodyKind | null
  readonly commandProperty: ESTree.Node | null
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
 * The `value` of the property named `name` on a non-computed object-literal
 * property, or `null`. The options-object properties are the only slots the
 * `make` signature reads — `command` the schema class, `decide` the decision —
 * so a locator pinned to argument slots misses both the moment the object
 * reorders them; reading by name cannot.
 */
const propertyValueOf = (node: ESTree.Node | null, name: string): ESTree.Node | null => {
  if (node === null || node.type !== 'ObjectExpression') return null
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed) continue
    const key = property.key
    const matched = key.type === 'Identifier'
      ? key.name === name
      : key.type === 'Literal' && typeof key.value === 'string' && key.value === name
    if (matched) return property.value
  }
  return null
}

/**
 * Every workflow construction call in the file — the declared constructor member
 * — shadow-correct: a local rebinding of the name is not the boundary, and an
 * alias that resolves back to the workflow import is. The callee is judged by its
 * import origin, never its spelling, so computed members, aliases, destructuring
 * and bind/apply/call indirections all count. The decision is the `decide`
 * property of the options object when it is an inline function or a same-file
 * reference (shorthand included); otherwise `resolvedBody` is `null` and the
 * caller reports it.
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
    // application - its arguments are the this-bound target, not the options
    // object - so the construction is the later call of the bound value.
    // `make.call(this, options)` invokes make directly and shifts the options
    // object one slot later. `make.apply(this, [options])` invokes it too, but
    // puts the whole list inside an array: reading slot 0 there yields that
    // array, so the command and decision reads both came back empty and every
    // rule keyed on them went silently dark on a real construction.
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
    const options = constructionArguments[0] ?? null
    const decide = propertyValueOf(options, DECIDE_PROPERTY)
    let resolvedBody: MakeBodyKind | null = null
    if (decide !== null) {
      if (isArrowFunction(decide) || isFunctionLike(decide)) {
        resolvedBody = decide
      } else if (isIdentifier(decide)) {
        // A shorthand `decide` property arrives as the bare identifier; so does a
        // written one. The follow-the-reference walk resolves either to its
        // module-scope declaration in this file.
        resolvedBody = followIdentifier(decide, context.sourceCode.getScope, 0)
      }
    }
    boundaries.push({
      makeCall: node,
      resolvedBody,
      commandProperty: propertyValueOf(options, COMMAND_PROPERTY),
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
