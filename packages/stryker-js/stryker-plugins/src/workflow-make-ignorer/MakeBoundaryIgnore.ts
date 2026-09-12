import {
  CallExpression,
  Identifier,
  ImportDeclaration,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  isArrowFunction,
  isCallExpression,
  isFunctionExpression,
  isIdentifier,
  isImportDeclaration,
  isImportNamespaceSpecifier,
  isImportSpecifier,
  isMemberExpression,
  isProgram,
  isStringLiteral,
  MemberExpression,
  Program,
} from './AstNode.schema.js'

export const NOT_INSIDE_WORKFLOW_MAKE =
  'mutant is outside every Workflow.make decision body; only make bodies are the mutation population' as const

/** The module whose `Workflow` value owns the `make` boundary. */
const WORKFLOW_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The import name a specifier must carry to be the workflow value. */
const WORKFLOW_IMPORT_NAME = 'Workflow' as const

/**
 * The members of the workflow value, mirroring the oxlint kernel's constructor set:
 * `make` and `total` construct a workflow from a decision, `andThen` composes one
 * workflow's decision output into the next workflow's command.
 */
const WORKFLOW_CONSTRUCTOR_MEMBERS: Readonly<Record<string, true>> = {
  make: true,
  total: true,
  andThen: true,
}

/**
 * The constructor members whose signature takes constructed workflows in place of a
 * decider: an `andThen` construction holds no decision body in the file that opens it,
 * so nothing in its argument list joins the mutation population. A member added above
 * without a line here keeps its decider body — and its mutants — in the population.
 */
const COMPOSING_MEMBERS: Readonly<Record<string, true>> = { andThen: true }

const NO_WORKFLOW_LOCALS: ReadonlySet<string> = new Set()
const NO_MAKE_ARGUMENT_BODIES: ReadonlySet<object> = new Set()

// -- unvalidated node shape probes -----------------------------------------------------------
// Four node kinds this gate reads — a named function declaration, a variable declaration, a
// declarator, and an export wrapper — have no schema in AstNode.schema.ts, so their shapes are
// probed off the raw parser node. Each probe asks one question about one value: a question that
// needs two goes through two names, because a logical operator is itself a path the mutation
// score must cover.

/** Any object the identity walk can descend into. */
const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Read a property off an unvalidated value; `undefined` when the value is not an object. */
const propertyOf = (value: unknown, key: string): unknown => {
  if (!isWalkable(value)) return undefined
  return value[key]
}

/** The string property at `key`, or `undefined` when it is absent or not a string. */
const stringPropertyOf = (value: unknown, key: string): string | undefined => {
  const raw = propertyOf(value, key)
  if (typeof raw !== 'string') return undefined
  return raw
}

/** True when an unvalidated value carries the given AST node tag. */
const hasNodeType = (value: unknown, type: string): boolean => stringPropertyOf(value, 'type') === type

/** True when the key is present on an unvalidated value. */
const hasProperty = (value: unknown, key: string): boolean => {
  if (!isWalkable(value)) return false
  return key in value
}

/** True when a resolved value is absent: `null` or `undefined`. */
const isAbsent = (value: unknown): boolean => value === undefined || value === null

/** A named `function` declaration statement. */
interface FunctionDeclarationNode {
  readonly type: 'FunctionDeclaration'
  readonly id: Identifier
}

/** A `const`/`let`/`var` declaration statement carrying declarators. */
interface VariableDeclarationNode {
  readonly type: 'VariableDeclaration'
  readonly kind: string
  readonly declarations: readonly unknown[]
}

/** A `name = init` declarator whose binding is a plain identifier. */
interface NamedDeclaratorNode {
  readonly type: 'VariableDeclarator'
  readonly id: Identifier
  readonly init: unknown
}

/** An `export`-wrapped statement; only its declaration carries a binding. */
interface ExportWrapperNode {
  readonly type: 'ExportNamedDeclaration' | 'ExportDefaultDeclaration'
  readonly declaration?: unknown
}

/** A named `function` declaration statement. */
const isFunctionDeclaration = (value: unknown): value is FunctionDeclarationNode =>
  hasNodeType(value, 'FunctionDeclaration') && isIdentifier(propertyOf(value, 'id'))

/** A declaration statement whose declarators hang off `declarations`. */
const isVariableDeclaration = (value: unknown): value is VariableDeclarationNode =>
  hasNodeType(value, 'VariableDeclaration') && hasKindAndDeclarations(value)

const hasKindAndDeclarations = (value: unknown): boolean =>
  hasProperty(value, 'kind') && Array.isArray(propertyOf(value, 'declarations'))

/** An `export` statement in either named or default form. */
const isExportWrapper = (value: unknown): value is ExportWrapperNode =>
  hasNodeType(value, 'ExportNamedDeclaration') || hasNodeType(value, 'ExportDefaultDeclaration')

/** The declaration an `export` wraps; the wrapper itself when it wraps none. */
const unwrapExport = (value: unknown): unknown => {
  if (!isExportWrapper(value)) return value
  return declaredValueOf(value)
}

const declaredValueOf = (wrapper: ExportWrapperNode): unknown => {
  if (isAbsent(wrapper.declaration)) return wrapper
  return wrapper.declaration
}

// -- Program-keyed memoization ---------------------------------------------------------------

/**
 * A pure derivation of one Program, memoized: the probe loop visits every mutant in the file,
 * and each derivation is a pure function of the Program it was keyed on.
 */
const memoizedForProgram = <T>(
  cache: WeakMap<object, T>,
  program: Program,
  derive: (program: Program) => T,
): T => {
  const cached = cache.get(program)
  if (cached !== undefined) return cached
  const derived = derive(program)
  cache.set(program, derived)
  return derived
}

// -- the workflow import resolution ----------------------------------------------------------

/** Program -> its workflow local names, so repeated mutant probes never re-walk the body. */
const WORKFLOW_LOCALS_BY_PROGRAM = new WeakMap<object, ReadonlySet<string>>()

/**
 * The local binding names that resolve to the `Workflow` value of the cell-types module: the
 * canonical `import { Workflow }`, an alias `import { Workflow as W }`, or the namespace form
 * `import * as Workflow`. This is deliberately a file-level import resolution, not a scope
 * analysis — the boundary is a mechanical gate, so a local shadowing the imported name
 * shadows the boundary too (no production site does this). Memoized keyed by the Program
 * node: the probe loop visits every mutant in the file, and the import set is a pure
 * function of the Program.
 */
const workflowLocalNamesOf = (program: unknown): ReadonlySet<string> => {
  if (!isProgram(program)) return NO_WORKFLOW_LOCALS
  return memoizedForProgram(WORKFLOW_LOCALS_BY_PROGRAM, program, workflowLocalNamesIn)
}

/** Every local name the file's cell-types imports bind. */
const workflowLocalNamesIn = (program: Program): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const statement of program.body) collectImportLocalNames(statement, names)
  return names
}

/** Adds the locals one statement binds, when that statement imports the workflow module. */
const collectImportLocalNames = (statement: unknown, names: Set<string>): void => {
  if (!isWorkflowImport(statement)) return
  addSpecifierLocalNames(statement.specifiers, names)
}

const addSpecifierLocalNames = (specifiers: readonly unknown[], names: Set<string>): void => {
  for (const specifier of specifiers) addWorkflowLocalName(specifier, names)
}

const addWorkflowLocalName = (specifier: unknown, names: Set<string>): void => {
  if (!isWorkflowImportSpecifier(specifier)) return
  names.add(specifier.local.name)
}

/** An import of the cell-types module, whatever its specifiers bind. */
const isWorkflowImport = (statement: unknown): statement is ImportDeclaration =>
  isImportDeclaration(statement) && carriesWorkflowSource(statement)

const carriesWorkflowSource = (statement: ImportDeclaration): boolean =>
  isStringLiteral(statement.source) && statement.source.value === WORKFLOW_SOURCE

/** A specifier binding a local name to the workflow value: the named or the namespace form. */
const isWorkflowImportSpecifier = (
  specifier: unknown,
): specifier is ImportSpecifier | ImportNamespaceSpecifier =>
  isImportNamespaceSpecifier(specifier) || isWorkflowNamedImport(specifier)

/** `{ Workflow as local }` — the imported name decides, the local alias is free. */
const isWorkflowNamedImport = (specifier: unknown): specifier is ImportSpecifier =>
  isImportSpecifier(specifier) && importsWorkflowName(specifier)

const importsWorkflowName = (specifier: ImportSpecifier): boolean =>
  isIdentifier(specifier.imported) && specifier.imported.name === WORKFLOW_IMPORT_NAME

// -- the boundary call shape -----------------------------------------------------------------

const isWorkflowMakeCallee = (
  callee: unknown,
  localNames: ReadonlySet<string>,
): callee is MemberExpression => isMemberExpression(callee) && isWorkflowMakeMember(callee, localNames)

const isWorkflowMakeMember = (member: MemberExpression, localNames: ReadonlySet<string>): boolean =>
  isWorkflowLocalMember(member, localNames) && isBodyBearingMemberName(member.property)

const isWorkflowLocalMember = (member: MemberExpression, localNames: ReadonlySet<string>): boolean =>
  isIdentifier(member.object) && localNames.has(member.object.name)

const isBodyBearingMemberName = (property: unknown): boolean =>
  isConstructorMemberName(property) && !isComposingMemberName(property)

const isConstructorMemberName = (property: unknown): boolean =>
  isIdentifier(property) && WORKFLOW_CONSTRUCTOR_MEMBERS[property.name] === true

const isComposingMemberName = (property: unknown): boolean =>
  isIdentifier(property) && COMPOSING_MEMBERS[property.name] === true

const isWorkflowMakeCall = (node: unknown, localNames: ReadonlySet<string>): node is CallExpression =>
  isCallExpression(node) && isWorkflowMakeCallee(node.callee, localNames)

// -- module-scope function reference resolution ---------------------------------------------
// A `Workflow.make(decision)` or `Workflow.total(decision)` call whose argument is an
// identifier resolving to a same-file function keeps that function's body inside the
// mutation population, mirroring the oxlint kernel's followIdentifier walk (depth-8 cycle
// bound). This is deliberately a file-level mechanical resolution, not a scope analysis —
// the boundary
// is a mechanical gate (see workflowLocalNamesOf), so a same-named local shadowing the
// module binding shadows the resolution too (no production site does this).

/** Follow depth bound, mirroring the oxlint kernel's cycle guard. */
const MAX_FOLLOW_DEPTH = 8

/**
 * The same-file follow walk: a make argument name resolves through module-scope
 * `const` bindings (function initializers and identifier aliases) and named
 * function declarations, with the depth bound breaking alias cycles.
 */
const followFunctionReference = (
  name: string,
  bindings: ReadonlyMap<string, unknown>,
  depth: number,
): unknown => {
  if (depth > MAX_FOLLOW_DEPTH) return null
  return resolveFollowingBinding(bindings.get(name), bindings, depth)
}

/** `null` for a name the file never binds; otherwise the binding's own resolution. */
const resolveFollowingBinding = (
  binding: unknown,
  bindings: ReadonlyMap<string, unknown>,
  depth: number,
): unknown => {
  if (isAbsent(binding)) return null
  return followableResolution(binding, bindings, depth)
}

/** A function node is the body itself; an identifier alias continues the walk. */
const followableResolution = (
  binding: unknown,
  bindings: ReadonlyMap<string, unknown>,
  depth: number,
): unknown => {
  if (isFunctionLike(binding)) return binding
  return aliasResolution(binding, bindings, depth)
}

const aliasResolution = (
  binding: unknown,
  bindings: ReadonlyMap<string, unknown>,
  depth: number,
): unknown => {
  if (!isIdentifier(binding)) return null
  return followFunctionReference(binding.name, bindings, depth + 1)
}

/** Any of the forms a decision body takes: an arrow, a `function` expression, or a declaration. */
const isFunctionLike = (value: unknown): boolean => isFunctionDeclaration(value) || isAnonymousFunction(value)

/** The anonymous decision forms: an arrow function or a `function` expression. */
const isAnonymousFunction = (value: unknown): boolean => isArrowFunction(value) || isFunctionExpression(value)

/** The module-scope bindings of a file: name -> function-like node, alias identifier, or null. */
const moduleBindingsOf = (programBody: readonly unknown[]): ReadonlyMap<string, unknown> => {
  const bindings = new Map<string, unknown>()
  for (const rawStatement of programBody) addStatementBinding(bindings, unwrapExport(rawStatement))
  return bindings
}

/** A named function declaration binds its own name; anything else binds through a declaration. */
const addStatementBinding = (bindings: Map<string, unknown>, statement: unknown): void => {
  if (isFunctionDeclaration(statement)) {
    bindings.set(statement.id.name, statement)
    return
  }
  addConstBindings(bindings, statement)
}

const addConstBindings = (bindings: Map<string, unknown>, statement: unknown): void => {
  if (!isConstDeclaration(statement)) return
  addDeclaratorBindings(bindings, statement.declarations)
}

const isConstDeclaration = (value: unknown): value is VariableDeclarationNode =>
  isVariableDeclaration(value) && value.kind === 'const'

const addDeclaratorBindings = (
  bindings: Map<string, unknown>,
  declarations: readonly unknown[],
): void => {
  for (const declarator of declarations) addDeclaratorBinding(bindings, declarator)
}

const addDeclaratorBinding = (bindings: Map<string, unknown>, declarator: unknown): void => {
  if (!isNamedDeclarator(declarator)) return
  addInitialisedBinding(bindings, declarator)
}

/** A declarator whose binding is a plain identifier: the only shape the follow walk keys on. */
const isNamedDeclarator = (value: unknown): value is NamedDeclaratorNode =>
  hasNodeType(value, 'VariableDeclarator') && hasIdentifierBinding(value)

/** The identifier and initialiser properties a keyable declarator carries. */
const hasIdentifierBinding = (value: unknown): boolean =>
  isIdentifier(propertyOf(value, 'id')) && hasProperty(value, 'init')

/** The initialiser decides: a function or alias the follow walk can use, otherwise null. */
const addInitialisedBinding = (
  bindings: Map<string, unknown>,
  declarator: NamedDeclaratorNode,
): void => {
  if (isAbsent(declarator.init)) return
  bindings.set(declarator.id.name, followableBindingOf(declarator.init))
}

/** The initialiser as a binding: a function-like node or alias identifier, otherwise null. */
const followableBindingOf = (init: unknown): unknown => {
  if (!isFollowableBinding(init)) return null
  return init
}

const isFollowableBinding = (init: unknown): boolean => isFunctionLike(init) || isIdentifier(init)

// -- the identity walk -----------------------------------------------------------------------

const walkAllNodes = (root: unknown, visit: (node: unknown) => void): void =>
  walkUnvisited(root, visit, new Set<object>())

/**
 * The cycle-guarded walk: a node is visited once, then every property value and array entry it
 * carries. A mutant's ancestor chain and a resolved decision body are matched by identity, so
 * the walk must reach every nested node the parser hung off the Program.
 */
const walkUnvisited = (
  value: unknown,
  visit: (node: unknown) => void,
  visited: Set<object>,
): void => {
  if (!claimNode(value, visited)) return
  visit(value)
  walkPropertyValues(value, visit, visited)
}

/** Claims a node for the walk; false when the value is not a node, or was already visited. */
const claimNode = (value: unknown, visited: Set<object>): value is Record<string, unknown> => {
  if (!isUnvisitedWalkable(value, visited)) return false
  visited.add(value)
  return true
}

const isUnvisitedWalkable = (value: unknown, visited: Set<object>): value is object =>
  isWalkable(value) && !visited.has(value)

const walkPropertyValues = (
  node: Record<string, unknown>,
  visit: (node: unknown) => void,
  visited: Set<object>,
): void => {
  for (const child of Object.values(node)) walkPropertyValue(child, visit, visited)
}

/** An array property is a list of nodes; every other property value is a node on its own. */
const walkPropertyValue = (
  child: unknown,
  visit: (node: unknown) => void,
  visited: Set<object>,
): void => {
  if (Array.isArray(child)) return walkEntries(child, visit, visited)
  walkUnvisited(child, visit, visited)
}

const walkEntries = (
  entries: readonly unknown[],
  visit: (node: unknown) => void,
  visited: Set<object>,
): void => {
  for (const entry of entries) walkUnvisited(entry, visit, visited)
}

// -- the resolved decision bodies ------------------------------------------------------------

/**
 * Program -> the same-file function bodies a `Workflow.make` or `Workflow.total`
 * identifier argument resolves to.
 */
const MAKE_ARGUMENT_BODIES_BY_PROGRAM = new WeakMap<object, ReadonlySet<object>>()

/**
 * The function nodes a make call names by identifier, memoized keyed by the Program:
 * the probe loop visits every mutant in the file, and the resolution is a pure
 * function of the Program. The bodies are the container objects — a mutant whose
 * ancestor chain includes one stays inside the population.
 */
const makeArgumentBodiesOf = (program: unknown): ReadonlySet<object> => {
  if (!isProgram(program)) return NO_MAKE_ARGUMENT_BODIES
  return memoizedForProgram(MAKE_ARGUMENT_BODIES_BY_PROGRAM, program, argumentBodiesIn)
}

const argumentBodiesIn = (program: Program): ReadonlySet<object> => {
  const bodies = new Set<object>()
  addMakeArgumentBodies(program, bodies)
  return bodies
}

/** A file whose `Workflow` binding is not the cell-types value opens no boundary at all. */
const addMakeArgumentBodies = (program: Program, bodies: Set<object>): void => {
  const localNames = workflowLocalNamesOf(program)
  if (localNames.size === 0) return
  collectMakeArgumentBodies(program, localNames, bodies)
}

const collectMakeArgumentBodies = (
  program: Program,
  localNames: ReadonlySet<string>,
  bodies: Set<object>,
): void => {
  const bindings = moduleBindingsOf(program.body)
  walkAllNodes(program, (node) => addFirstMakeArgumentBody(node, localNames, bindings, bodies))
}

const addFirstMakeArgumentBody = (
  node: unknown,
  localNames: ReadonlySet<string>,
  bindings: ReadonlyMap<string, unknown>,
  bodies: Set<object>,
): void => {
  if (!isWorkflowMakeCall(node, localNames)) return
  addResolvedBody(firstResolvedBodyIn(node.arguments, bindings), bodies)
}

/**
 * The body of the first argument that resolves to one. The decider is found by SHAPE, never by
 * slot index: a constructor that takes a decider takes the command schema class first and the
 * decider second, so a resolver pinned to slot 0 resolves a class to nothing and silently drops
 * the referenced decision body out of the mutation population — every mutant in it stops being
 * tested while the score still reports green.
 */
const firstResolvedBodyIn = (
  args: readonly unknown[],
  bindings: ReadonlyMap<string, unknown>,
): object | undefined => args.map((argument) => resolvedBodyOf(argument, bindings)).find(isDefined)

/** The object one make argument resolves to; a non-identifier argument resolves to nothing. */
const resolvedBodyOf = (
  argument: unknown,
  bindings: ReadonlyMap<string, unknown>,
): object | undefined => {
  if (!isIdentifier(argument)) return undefined
  return resolvedObjectOf(followFunctionReference(argument.name, bindings, 0))
}

/** A resolved reference counts only when it is a node: containment is object identity. */
const resolvedObjectOf = (value: unknown): object | undefined => {
  if (!isWalkable(value)) return undefined
  return value
}

const isDefined = <T>(value: T | undefined): value is T => value !== undefined

const addResolvedBody = (body: object | undefined, bodies: Set<object>): void => {
  if (body === undefined) return
  bodies.add(body)
}

// -- the inverted population selector --------------------------------------------------------

/**
 * True when the mutant descends from an argument slot of a body-bearing constructor call — the
 * parser puts the decider body under the call's `arguments` array, so identity containment through
 * the walk is the boundary test. A mutant ON the call (its callee or the call itself) is outside
 * the argument and therefore outside the population, which is the point of the inverted gate.
 */
const insideMakeBoundary = (node: unknown, ancestors: readonly unknown[]): boolean => {
  const root = workflowRootOf(ancestors)
  const localNames = workflowLocalNamesOf(root)
  if (localNames.size === 0) return false
  return insideMakeArgument(node, ancestors, localNames, root)
}

/** The outermost Program in the chain — the file the mutant was parsed from. */
const workflowRootOf = (ancestors: readonly unknown[]): unknown =>
  ancestors.reduce<unknown>(outermostProgramOf, undefined)

const outermostProgramOf = (root: unknown, ancestor: unknown): unknown => {
  if (isProgram(ancestor)) return ancestor
  return root
}

/** Direct containment first: an ancestor make call whose argument slot holds the mutant. */
const insideMakeArgument = (
  node: unknown,
  ancestors: readonly unknown[],
  localNames: ReadonlySet<string>,
  root: unknown,
): boolean => {
  if (ancestorsContainMakeArgument(node, ancestors, localNames)) return true
  return insideResolvedBody(node, ancestors, root)
}

const ancestorsContainMakeArgument = (
  node: unknown,
  ancestors: readonly unknown[],
  localNames: ReadonlySet<string>,
): boolean =>
  ancestors.some((ancestor, index) =>
    isMakeArgumentBoundary(ancestor, chainChildOf(node, ancestors, index), localNames)
  )

/** An ancestor call is the boundary when the node one step below it sits in an argument slot. */
const isMakeArgumentBoundary = (
  ancestor: unknown,
  child: unknown,
  localNames: ReadonlySet<string>,
): boolean => isWorkflowMakeCall(ancestor, localNames) && ancestor.arguments.includes(child)

/** The node one step below `ancestors[index]`: the mutant itself for its immediate parent. */
const chainChildOf = (node: unknown, ancestors: readonly unknown[], index: number): unknown => {
  if (index === 0) return node
  return ancestors[index - 1]
}

/**
 * A make argument naming a same-file function keeps that function's body inside the population
 * even though the call is a sibling statement, not an ancestor: the resolved body's identity in
 * the mutant's ancestor chain is the containment.
 */
const insideResolvedBody = (
  node: unknown,
  ancestors: readonly unknown[],
  root: unknown,
): boolean => {
  const resolvedBodies = makeArgumentBodiesOf(root)
  if (resolvedBodies.size === 0) return false
  return chainContainsResolvedBody(node, ancestors, resolvedBodies)
}

const chainContainsResolvedBody = (
  node: unknown,
  ancestors: readonly unknown[],
  resolvedBodies: ReadonlySet<object>,
): boolean => {
  if (isResolvedBody(node, resolvedBodies)) return true
  return ancestors.some((ancestor) => isResolvedBody(ancestor, resolvedBodies))
}

const isResolvedBody = (value: unknown, resolvedBodies: ReadonlySet<object>): boolean =>
  isWalkable(value) && resolvedBodies.has(value)

/**
 * The inverted population selector: every mutant whose ancestor chain contains no
 * `Workflow.make(...)` or `Workflow.total(...)` call argument is excised with the named
 * reason, and every mutant inside any make boundary passes through to the next ignorer.
 */
export const decideWorkflowMakeBoundaryIgnore = (
  node: unknown,
  ancestors: readonly unknown[],
): string | undefined => {
  if (insideMakeBoundary(node, ancestors)) return undefined
  return NOT_INSIDE_WORKFLOW_MAKE
}
