import { Schema as S } from 'effect'
import {
  CallExpression,
  Identifier,
  ImportDeclaration,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  MemberExpression,
  Program,
  StringLiteral,
} from './ast-node.kernel.js'

export const NOT_INSIDE_WORKFLOW_MAKE =
  'mutant is outside every Workflow.make decision body; only make bodies are the mutation population' as const

/** The module whose `Workflow` value owns the `make` boundary. */
const WORKFLOW_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The import name a specifier must carry to be the workflow value. */
const WORKFLOW_IMPORT_NAME = 'Workflow' as const

/** The member of the workflow value the boundary call invokes. */
const MAKE_MEMBER_NAME = 'make' as const

const isProgram = S.is(Program)
const isImportDeclaration = S.is(ImportDeclaration)
const isImportSpecifier = S.is(ImportSpecifier)
const isImportNamespaceSpecifier = S.is(ImportNamespaceSpecifier)
const isIdentifier = S.is(Identifier)
const isStringLiteral = S.is(StringLiteral)
const isMemberExpression = S.is(MemberExpression)
const isCallExpression = S.is(CallExpression)

const NO_WORKFLOW_LOCALS: ReadonlySet<string> = new Set()

/**
 * The local binding names that resolve to the `Workflow` value of the cell-types module: the
 * canonical `import { Workflow }`, an alias `import { Workflow as W }`, or the namespace form
 * `import * as Workflow`. This is deliberately a file-level import resolution, not a scope
 * analysis — the boundary is a mechanical gate, so a local shadowing the imported name
 * shadows the boundary too (no production site does this).
 */
const workflowLocalNamesOf = (program: unknown): ReadonlySet<string> => {
  if (!isProgram(program)) return NO_WORKFLOW_LOCALS
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
  return names
}

const isWorkflowMakeCallee = (callee: unknown, localNames: ReadonlySet<string>): boolean =>
  isMemberExpression(callee) &&
  isIdentifier(callee.object) && localNames.has(callee.object.name) &&
  isIdentifier(callee.property) && callee.property.name === MAKE_MEMBER_NAME

const isWorkflowMakeCall = (node: unknown, localNames: ReadonlySet<string>): node is CallExpression =>
  isCallExpression(node) && isWorkflowMakeCallee(node.callee, localNames)

const isArgumentOf = (node: unknown, call: CallExpression): boolean => call.arguments.includes(node)

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
