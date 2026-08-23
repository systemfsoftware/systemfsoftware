import {
  CallExpression,
  Identifier,
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
} from './AstNode.schema.js'

export const NOT_INSIDE_WORKFLOW_MAKE =
  'mutant is outside every Workflow.make decision body; only make bodies are the mutation population' as const

/** The module whose `Workflow` value owns the `make` boundary. */
const WORKFLOW_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The import name a specifier must carry to be the workflow value. */
const WORKFLOW_IMPORT_NAME = 'Workflow' as const

/** The member of the workflow value the boundary call invokes. */
const MAKE_MEMBER_NAME = 'make' as const

const NO_WORKFLOW_LOCALS: ReadonlySet<string> = new Set()
const NO_MAKE_ARGUMENT_BODIES: ReadonlySet<object> = new Set()

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
  const cached = WORKFLOW_LOCALS_BY_PROGRAM.get(program)
  if (cached !== undefined) return cached
  const names = new Set<string>()
  for (const statement of program.body) {
    if (!isImportDeclaration(statement) || !isStringLiteral(statement.source)) continue
    if (statement.source.value !== WORKFLOW_SOURCE) continue
    for (const specifier of statement.specifiers) {
      if (isImportNamespaceSpecifier(specifier)) {
        names.add(specifier.local.name)
      } else if (
        isImportSpecifier(specifier) &&
        isIdentifier(specifier.imported) &&
        specifier.imported.name === WORKFLOW_IMPORT_NAME
      ) {
        names.add(specifier.local.name)
      }
    }
  }
  WORKFLOW_LOCALS_BY_PROGRAM.set(program, names)
  return names
}

const isWorkflowMakeCallee = (callee: unknown, localNames: ReadonlySet<string>): boolean =>
  isMemberExpression(callee) &&
  isIdentifier(callee.object) && localNames.has(callee.object.name) &&
  isIdentifier(callee.property) && callee.property.name === MAKE_MEMBER_NAME

const isWorkflowMakeCall = (node: unknown, localNames: ReadonlySet<string>): node is CallExpression =>
  isCallExpression(node) && isWorkflowMakeCallee(node.callee, localNames)

const isArgumentOf = (node: unknown, call: CallExpression): boolean => call.arguments.includes(node)

// -- module-scope function reference resolution ---------------------------------------------
// A `Workflow.make(decision)` call whose argument is an identifier resolving to a
// same-file function keeps that function's body inside the mutation population,
// mirroring the oxlint kernel's followIdentifier walk (depth-8 cycle bound). This is
// deliberately a file-level mechanical resolution, not a scope analysis — the boundary
// is a mechanical gate (see workflowLocalNamesOf), so a same-named local shadowing the
// module binding shadows the resolution too (no production site does this).

const isFunctionDeclaration = (
  value: unknown,
): value is { readonly type: 'FunctionDeclaration'; readonly id: Identifier } => {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || value['type'] !== 'FunctionDeclaration') return false
  return 'id' in value && isIdentifier(value['id'])
}

const isVariableDeclaration = (
  value: unknown,
): value is {
  readonly type: 'VariableDeclaration'
  readonly kind: string
  readonly declarations: readonly unknown[]
} => {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || value['type'] !== 'VariableDeclaration') return false
  return 'kind' in value && 'declarations' in value && Array.isArray(value['declarations'])
}

const isVariableDeclarator = (
  value: unknown,
): value is { readonly type: 'VariableDeclarator'; readonly id: unknown; readonly init: unknown } => {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || value['type'] !== 'VariableDeclarator') return false
  return 'id' in value && 'init' in value
}

const isExportWrapper = (
  value: unknown,
): value is {
  readonly type: 'ExportNamedDeclaration' | 'ExportDefaultDeclaration'
  readonly declaration?: unknown
} => {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value)) return false
  return value['type'] === 'ExportNamedDeclaration' || value['type'] === 'ExportDefaultDeclaration'
}

const unwrapExport = (value: unknown): unknown =>
  isExportWrapper(value) && 'declaration' in value &&
    value.declaration !== undefined && value.declaration !== null
    ? value.declaration
    : value

const isFunctionLike = (value: unknown): boolean =>
  isArrowFunction(value) || isFunctionExpression(value) || isFunctionDeclaration(value)

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
  const binding = bindings.get(name)
  if (binding === undefined || binding === null) return null
  if (isFunctionLike(binding)) return binding
  if (isIdentifier(binding)) return followFunctionReference(binding.name, bindings, depth + 1)
  return null
}

/** The module-scope bindings of a file: name -> function-like node, alias identifier, or null. */
const moduleBindingsOf = (programBody: readonly unknown[]): ReadonlyMap<string, unknown> => {
  const bindings = new Map<string, unknown>()
  for (const rawStatement of programBody) {
    const statement = unwrapExport(rawStatement)
    if (isFunctionDeclaration(statement)) {
      bindings.set(statement.id.name, statement)
      continue
    }
    if (!isVariableDeclaration(statement) || statement.kind !== 'const') continue
    for (const declarator of statement.declarations) {
      if (!isVariableDeclarator(declarator) || !isIdentifier(declarator.id)) continue
      const init = declarator.init
      if (init === null || init === undefined) continue
      bindings.set(declarator.id.name, isFunctionLike(init) || isIdentifier(init) ? init : null)
    }
  }
  return bindings
}

const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const walkAllNodes = (root: unknown, visit: (node: unknown) => void): void => {
  const visited = new Set<object>()
  const walk = (value: unknown): void => {
    if (!isWalkable(value)) return
    if (visited.has(value)) return
    visited.add(value)
    visit(value)
    for (const key of Object.keys(value)) {
      const child = value[key]
      if (Array.isArray(child)) {
        for (const entry of child) walk(entry)
      } else {
        walk(child)
      }
    }
  }
  walk(root)
}

/** Program -> the same-file function bodies a `Workflow.make` identifier argument resolves to. */
const MAKE_ARGUMENT_BODIES_BY_PROGRAM = new WeakMap<object, ReadonlySet<object>>()

/**
 * The function nodes a make call names by identifier, memoized keyed by the Program:
 * the probe loop visits every mutant in the file, and the resolution is a pure
 * function of the Program. The bodies are the container objects — a mutant whose
 * ancestor chain includes one stays inside the population.
 */
const makeArgumentBodiesOf = (program: unknown): ReadonlySet<object> => {
  if (!isProgram(program)) return NO_MAKE_ARGUMENT_BODIES
  const cached = MAKE_ARGUMENT_BODIES_BY_PROGRAM.get(program)
  if (cached !== undefined) return cached
  const bodies = new Set<object>()
  const localNames = workflowLocalNamesOf(program)
  if (localNames.size > 0) {
    const bindings = moduleBindingsOf(program.body)
    walkAllNodes(program, (node) => {
      if (!isCallExpression(node)) return
      if (!isWorkflowMakeCallee(node.callee, localNames)) return
      // The decider is found by SHAPE, never by slot index: `make` takes the
      // command schema class first and the decider second, so a resolver pinned
      // to slot 0 resolves a class to nothing and silently drops the referenced
      // decision body out of the mutation population — every mutant in it stops
      // being tested while the score still reports green.
      for (const argument of node.arguments) {
        if (!isIdentifier(argument)) continue
        const resolved = followFunctionReference(argument.name, bindings, 0)
        if (resolved !== null && typeof resolved === 'object') {
          bodies.add(resolved)
          break
        }
      }
    })
  }
  MAKE_ARGUMENT_BODIES_BY_PROGRAM.set(program, bodies)
  return bodies
}

/**
 * True when the mutant descends from an argument slot of a `Workflow.make` call — babel nests
 * the make body under the call's `arguments` array, so identity containment through the walk
 * is the boundary test. A mutant ON the call (its callee or the call itself) is outside the
 * argument and therefore outside the population, which is the point of the inverted gate.
 */
const insideMakeBoundary = (node: unknown, ancestors: readonly unknown[]): boolean => {
  // The Program is the file root; babel wraps it in a File node above, so search, don't assume.
  let root: unknown = undefined
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (isProgram(ancestors[i])) {
      root = ancestors[i]
      break
    }
  }
  const localNames = workflowLocalNamesOf(root)
  if (localNames.size === 0) return false
  for (let i = 0; i < ancestors.length; i++) {
    const ancestor = ancestors[i]
    const child = i === 0 ? node : ancestors[i - 1]
    if (isWorkflowMakeCall(ancestor, localNames) && isArgumentOf(child, ancestor)) return true
  }
  // A make argument naming a same-file function keeps that function's body inside
  // the population even though the call is a sibling statement, not an ancestor:
  // the resolved body's identity in the mutant's ancestor chain is the containment.
  const resolvedBodies = makeArgumentBodiesOf(root)
  if (resolvedBodies.size === 0) return false
  if (typeof node === 'object' && node !== null && resolvedBodies.has(node)) return true
  for (const ancestor of ancestors) {
    if (typeof ancestor === 'object' && ancestor !== null && resolvedBodies.has(ancestor)) return true
  }
  return false
}

/**
 * The inverted population selector: every mutant whose ancestor chain contains no
 * `Workflow.make(...)` call argument is excised with the named reason, and every mutant
 * inside any make boundary passes through to the next ignorer.
 */
export const decideWorkflowMakeBoundaryIgnore = (
  node: unknown,
  ancestors: readonly unknown[],
): string | undefined => (insideMakeBoundary(node, ancestors) ? undefined : NOT_INSIDE_WORKFLOW_MAKE)
