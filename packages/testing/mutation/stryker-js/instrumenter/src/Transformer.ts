// oxlint-disable typescript/no-unsafe-type-assertion typescript/no-unnecessary-type-assertion

import { type IgnorerService, type NodePath as IgnorerNodePath } from '@systemfsoftware/stryker-js/Ignorer'
import { INSTRUMENTER_CONSTANTS as ID } from '@systemfsoftware/stryker-js/Mutant'
import { type MutateDescription, type Position } from '@systemfsoftware/stryker-js/Mutant'
import { propertyPath, type StrykerOptions, strykerReportBugUrl } from '@systemfsoftware/stryker-js/Schema'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import type { Comment, Expression, Node, Program, Statement } from 'estree'
import path from 'node:path'
import { parseSync } from 'oxc-parser'

import {
  arrowFunctionExpression,
  attachComments,
  type AttachedComment,
  blockStatement,
  buildLineTable,
  callExpression,
  cloneNode,
  conditionalExpression,
  expressionStatement,
  identifier,
  ifStatement,
  isExpressionKind,
  isStatementKind,
  nodeType,
  positionFromLineTable,
  returnStatement,
  sequenceExpression,
  spanOf,
  stringLiteral,
  switchCase,
  traverse,
  type TraversePath,
  variableDeclaration,
  variableDeclarator,
} from './estree.js'
import { applyMutant, createMutant, type Mutable, type Mutant } from './Mutator.js'
import { type MutatorContext, type MutatorOptions } from './Mutator.js'
import { allMutators } from './Mutator.js'
import {
  type Ast,
  type AstByFormat,
  AstFormat,
  locationIncluded,
  locationOverlaps,
  type ScriptFormat,
  type SourceLocationInFile,
} from './Syntax.js'
import { PlacementFailed, TransformFailed } from './Transformer.schema.js'
export { PlacementFailed, TransformFailed }

const STRYKER_NAMESPACE_HELPER = 'stryNS_9fa48'
const COVER_MUTANT_HELPER = 'stryCov_9fa48'
const IS_MUTANT_ACTIVE_HELPER = 'stryMutAct_9fa48'

export interface TransformerOptions extends MutatorOptions {
  ignorers: IgnorerService[]
}

export type MutantCollector = Mutant[]

export function createMutantCollector(): MutantCollector {
  return []
}

export function collect(
  collector: MutantCollector,
  fileName: string,
  original: Node,
  mutable: Mutable,
  offset: Position = { line: 0, column: 0 },
  lineTable: readonly number[] = buildLineTable(''),
): Mutant {
  const mutant = createMutant(
    collector.length.toString(),
    fileName,
    original,
    mutable,
    offset,
    lineTable,
  )
  collector.push(mutant)
  return mutant
}

export function hasPlacedMutants(
  collector: readonly Mutant[],
  fileName: string,
): boolean {
  return collector.some(
    (mutant) => mutant.fileName === fileName && mutant.ignoreReason === undefined,
  )
}

const WILDCARD = 'all'
const DEFAULT_REASON = 'Ignored using a comment'

const strykerCommentDirectiveRegex = /^\s?Stryker (disable|restore)(?: (next-line))? ([a-zA-Z, ]+)(?::(.+)?)?/

export type Rule =
  | { readonly kind: 'Root' }
  | {
    readonly kind: 'Ignore'
    readonly mutatorNames: readonly string[]
    readonly line: number | undefined
    readonly ignoreReason: string
    readonly previous: Rule
  }
  | {
    readonly kind: 'Restore'
    readonly mutatorNames: readonly string[]
    readonly line: number | undefined
    readonly previous: Rule
  }

export const rootRule: Rule = { kind: 'Root' }

export function findIgnoreReason(
  rule: Rule,
  mutatorName: string,
  line: number,
): string | undefined {
  const lower = mutatorName.toLowerCase()
  let current: Rule = rule
  for (;;) {
    switch (current.kind) {
      case 'Root':
        return undefined
      case 'Ignore': {
        const lineMatches = current.line === undefined || current.line === line
        const mutatorMatches = current.mutatorNames.includes(lower) ||
          current.mutatorNames.includes(WILDCARD)
        if (lineMatches && mutatorMatches) {
          return current.ignoreReason
        }
        current = current.previous
        break
      }
      case 'Restore': {
        const lineMatches = current.line === undefined || current.line === line
        const mutatorMatches = current.mutatorNames.includes(lower) ||
          current.mutatorNames.includes(WILDCARD)
        if (lineMatches && mutatorMatches) {
          return undefined
        }
        current = current.previous
        break
      }
    }
  }
}

interface LocatedComment extends Comment {
  readonly loc?: {
    readonly start: { readonly line: number; readonly column: number }
    readonly end: { readonly line: number; readonly column: number }
  }
}

export function processStrykerDirectives(
  rule: Rule,
  node: Node,
  allMutatorNames: readonly string[],
  originFileName: string,
): { rule: Rule; warnings: readonly string[] } {
  const leadingComments = (node as { leadingComments?: readonly LocatedComment[] }).leadingComments
  if (!leadingComments) {
    return { rule, warnings: [] }
  }
  let current: Rule = rule
  const warnings: string[] = []
  for (const comment of leadingComments) {
    const matchResult = strykerCommentDirectiveRegex.exec(comment.value)
    if (!matchResult) {
      continue
    }
    const directiveType = matchResult[1]
    const scope = matchResult[2]
    const mutators = matchResult[3]
    const optionalReason = matchResult[4]
    if (directiveType === undefined || mutators === undefined) {
      throw new Error('Stryker directive without directive type or mutators')
    }
    let mutatorNames = mutators.split(',').map((mutator) => mutator.trim())
    for (const mutator of mutatorNames) {
      if (mutator === WILDCARD) continue
      if (!allMutatorNames.includes(mutator.toLowerCase())) {
        const commentLoc = comment.loc
        if (commentLoc == null) {
          throw new Error('Comment without location')
        }
        let directiveLabel: string
        if (scope !== undefined && scope !== '') {
          directiveLabel = `${directiveType} ${scope}`
        } else {
          directiveLabel = directiveType
        }
        warnings.push(
          `Unused 'Stryker ${directiveLabel}' directive. Mutator with name '${mutator}' not found. Directive found at: ${originFileName}:${commentLoc.start.line}:${commentLoc.start.column}.`,
        )
      }
    }
    mutatorNames = mutatorNames.map((mutator) => mutator.toLowerCase())
    const reason = (optionalReason ?? DEFAULT_REASON).trim()
    current = applyDirective(current, directiveType, scope, mutatorNames, reason, comment.loc)
  }
  return { rule: current, warnings }
}

function applyDirective(
  rule: Rule,
  directiveType: string,
  scope: string | undefined,
  mutatorNames: string[],
  reason: string,
  loc: { start: { line: number; column: number } } | undefined,
): Rule {
  switch (directiveType) {
    case 'disable':
      return applyDisable(rule, scope, mutatorNames, reason, loc)
    case 'restore':
      return applyRestore(rule, scope, mutatorNames, loc)
    default:
      return rule
  }
}

function applyDisable(
  rule: Rule,
  scope: string | undefined,
  mutatorNames: string[],
  reason: string,
  loc: { start: { line: number; column: number } } | undefined,
): Rule {
  switch (scope) {
    case 'next-line':
      return {
        kind: 'Ignore',
        mutatorNames,
        line: getLine(loc),
        ignoreReason: reason,
        previous: rule,
      }
    case undefined:
    default:
      return {
        kind: 'Ignore',
        mutatorNames,
        line: undefined,
        ignoreReason: reason,
        previous: rule,
      }
  }
}

function applyRestore(
  rule: Rule,
  scope: string | undefined,
  mutatorNames: string[],
  loc: { start: { line: number; column: number } } | undefined,
): Rule {
  switch (scope) {
    case 'next-line':
      return {
        kind: 'Restore',
        mutatorNames,
        line: getLine(loc),
        previous: rule,
      }
    case undefined:
    default:
      return {
        kind: 'Restore',
        mutatorNames,
        line: undefined,
        previous: rule,
      }
  }
}

function getLine(loc: { start: { line: number; column: number } } | undefined): number {
  if (loc == null) {
    throw new Error('Comment without location')
  }
  return loc.start.line
}

function toIgnorerPath(path: TraversePath): IgnorerNodePath {
  let parentResult: IgnorerNodePath | null = null
  if (path.parentPath !== null) {
    parentResult = toIgnorerPath(path.parentPath)
  }
  const node: unknown = path.node
  const result: IgnorerNodePath = {
    node: path.node,
    parentPath: parentResult,
    isObjectExpression(): boolean {
      return nodeType(node) === 'ObjectExpression'
    },
    isCallExpression(): boolean {
      return nodeType(node) === 'CallExpression'
    },
    isClassProperty(): boolean {
      return nodeType(node) === 'PropertyDefinition'
    },
    isClassPrivateProperty(): boolean {
      return nodeType(node) === 'PropertyDefinition' &&
        Predicate.hasProperty(node, 'key') && nodeType(PredicateRecord.key(node)) === 'PrivateIdentifier'
    },
    isClassAccessorProperty(): boolean {
      return nodeType(node) === 'AccessorProperty'
    },
  }
  return result
}

const PredicateRecord = {
  key: (
    node: unknown,
  ): unknown => (Predicate.hasProperty(node, 'key') ? (node as Record<string, unknown>)['key'] : undefined),
}

export function isTypeNode(path: TraversePath): boolean {
  return (
    flowTypeAnnotationNodeTypes.includes(path.node.type) ||
    tsTypeAnnotationNodeTypes.includes(path.node.type) ||
    isDeclareVariableStatement(path.node) ||
    isDeclareModule(path.node)
  )
}

function isDeclareVariableStatement(node: Node): boolean {
  return nodeType(node) === 'VariableDeclaration' && 'declare' in node && node.declare === true
}

function isDeclareModule(node: Node): boolean {
  return nodeType(node) === 'TSModuleDeclaration' && 'declare' in node && node.declare === true
}

const tsTypeAnnotationNodeTypes: ReadonlyArray<string> = Object.freeze([
  'TSAsExpression',
  'TSInterfaceDeclaration',
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
  'TSDeclareFunction',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
])

const flowTypeAnnotationNodeTypes: ReadonlyArray<string> = Object.freeze([
  'DeclareClass',
  'DeclareFunction',
  'DeclareInterface',
  'DeclareModule',
  'DeclareModuleExports',
  'DeclareTypeAlias',
  'DeclareOpaqueType',
  'DeclareVariable',
  'DeclareExportDeclaration',
  'DeclareExportAllDeclaration',
  'InterfaceDeclaration',
  'OpaqueType',
  'TypeAlias',
])

export function isImportDeclaration(path: TraversePath): boolean {
  return (
    nodeType(path.node) === 'TSImportEqualsDeclaration' || path.node.type === 'ImportDeclaration'
  )
}

export function mutantTestExpression(
  mutantId: string,
): Expression {
  return callExpression(identifier(IS_MUTANT_ACTIVE_HELPER), [stringLiteral(mutantId)])
}

export function mutationCoverageSequenceExpression(
  mutants: Iterable<Mutant>,
  targetExpression?: Expression,
): Expression {
  const mutantIds = [...mutants].map((mutant) => stringLiteral(mutant.id))
  const sequence: Expression[] = [
    callExpression(identifier(COVER_MUTANT_HELPER), mutantIds),
  ]
  if (targetExpression) {
    sequence.push(targetExpression)
  }
  return sequenceExpression(sequence)
}

export interface MutantPlacer {
  name: string
  canPlace(path: TraversePath): boolean
  place(path: TraversePath, appliedMutants: Map<Mutant, Node>): void
}

export function nodeOfKind(
  mutant: Mutant,
  node: Node,
  isKind: (candidate: Node) => boolean,
  kind: string,
): Node {
  if (!isKind(node)) {
    throw new Error(`Cannot place mutant ${mutant.id}: expected ${kind}, got ${node.type}`)
  }
  return node
}

export function throwPlacementError(
  error: Error,
  nodePath: TraversePath,
  placer: MutantPlacer,
  mutants: Mutant[],
  fileName: string,
  lineTable: readonly number[],
): never {
  const span = spanOf(nodePath.node)
  const position = span !== undefined ? positionFromLineTable(span.start, lineTable) : undefined
  const location = `${path.relative(process.cwd(), fileName)}:${position?.line}:${position?.column}`
  const message = `${placer.name} could not place mutants with type(s): "${
    new Intl.ListFormat('en').format(mutants.map((mutant) => mutant.mutatorName))
  }"`
  const errorMessage =
    `${location} ${message}. Either remove this file from the list of files to be mutated, or exclude the mutator (using ${
      propertyPath<StrykerOptions>()(
        'mutator',
        'excludedMutations',
      )
    }). Please report this issue at ${strykerReportBugUrl(message)}. Original error: ${error.stack}`
  throw new Error(errorMessage)
}

function classOrFunctionExpressionNamedIfNeeded(
  path: TraversePath,
): Expression | undefined {
  const kind = nodeType(path.node)
  if (
    (kind === 'FunctionExpression' || kind === 'ClassExpression') && !('id' in path.node) === false &&
    path.node['id' as keyof Node] !== null
  ) {
    // fallthrough handled below
  }
  if (
    (kind === 'FunctionExpression' || kind === 'ClassExpression') &&
    ('id' in path.node) &&
    (path.node as { id?: unknown }).id == null
  ) {
    const parentPath = path.parentPath
    if (
      parentPath !== null && parentPath.node.type === 'VariableDeclarator' && parentPath.node.id.type === 'Identifier'
    ) {
      ;(path.node as unknown as { id: unknown }).id = parentPath.node.id
      return path.node as Expression
    }
    if (
      parentPath !== null && parentPath.node.type === 'Property' && parentPath.node.key.type === 'Identifier' &&
      path.getStatementParent()?.node.type === 'VariableDeclaration'
    ) {
      return path.node as Expression
    }
  }
  return
}

function arrowFunctionExpressionNamedIfNeeded(
  path: TraversePath,
): Expression | undefined {
  const parentPath = path.parentPath
  if (
    path.node.type === 'ArrowFunctionExpression' &&
    parentPath !== null && parentPath.node.type === 'VariableDeclarator' &&
    parentPath.node.id.type === 'Identifier'
  ) {
    const declaratorId = parentPath.node.id
    return callExpression(
      arrowFunctionExpression(
        [],
        blockStatement([
          variableDeclaration('const', [variableDeclarator(declaratorId, path.node)]),
          returnStatement(declaratorId),
        ]),
      ),
      [],
    )
  }
  return
}

function nameIfAnonymous(
  path: TraversePath,
): Expression {
  return (
    classOrFunctionExpressionNamedIfNeeded(path) ??
      arrowFunctionExpressionNamedIfNeeded(path) ??
      path.node as Expression
  )
}

function isMemberOrCallOrNonNullExpression(path: TraversePath | null): boolean {
  return isCallExpressionNode(path) || isMemberOrNonNullExpression(path)
}

function isMemberOrNonNullExpression(path: TraversePath | null): boolean {
  return isMemberExpressionNode(path) || nodeType(path?.node) === 'TSNonNullExpression'
}

function isMemberExpressionNode(path: TraversePath | null): boolean {
  return nodeType(path?.node) === 'MemberExpression'
}

function isCallExpressionNode(path: TraversePath | null): boolean {
  return nodeType(path?.node) === 'CallExpression'
}
function isValidExpression(path: TraversePath): boolean {
  const parent = path.parentPath
  if (parent === null) {
    return true
  }
  const parentNode = parent.node
  return (
    !isObjectPropertyKey() &&
    !isPartOfChain() &&
    !(parentNode.type === 'TaggedTemplateExpression') &&
    !isPartOfDeleteExpression() &&
    !isPartOfAssignmentExpression()
  )

  function isObjectPropertyKey() {
    return parentNode.type === 'Property' && parentNode.key === path.node
  }

  function isPartOfChain() {
    return (
      isMemberOrCallOrNonNullExpression(path) &&
      ((isMemberExpressionNode(parent) &&
        !(parentNode.type === 'MemberExpression' && parentNode.computed && parentNode.property === path.node)) ||
        nodeType(parentNode) === 'TSNonNullExpression' ||
        (isCallExpressionNode(parent) && parentNode.type === 'CallExpression' && parentNode.callee === path.node))
    )
  }

  function isPartOfDeleteExpression() {
    return parentNode.type === 'UnaryExpression' && parentNode.operator === 'delete'
  }

  function isPartOfAssignmentExpression() {
    return parentNode.type === 'AssignmentExpression' && parentNode.left === path.node
  }
}

export function unwrapParenthesizedExpression(node: Node): Node {
  let current = node
  while (nodeType(current) === 'ParenthesizedExpression') {
    const wrapper: unknown = current
    if (typeof wrapper !== 'object' || wrapper === null || !('expression' in wrapper)) {
      break
    }
    const inner = wrapper.expression as Node
    if (inner === undefined || inner === null) {
      break
    }
    current = inner
  }
  return current
}

export const expressionMutantPlacer: MutantPlacer = {
  name: 'expressionMutantPlacer',
  canPlace(path) {
    return path.isExpression() && isValidExpression(path)
  },
  place(path, appliedMutants) {
    let expression = nameIfAnonymous(path)
    expression = mutationCoverageSequenceExpression(
      appliedMutants.keys(),
      expression,
    )
    for (const [mutant, appliedMutant] of appliedMutants) {
      expression = conditionalExpression(
        mutantTestExpression(mutant.id),
        nodeOfKind(
          mutant,
          unwrapParenthesizedExpression(appliedMutant),
          isExpressionKind,
          'an expression',
        ) as Expression,
        expression,
      )
    }
    path.replaceWith(expression)
  },
}

export const statementMutantPlacer: MutantPlacer = {
  name: 'statementMutantPlacer',
  canPlace(path) {
    return path.isStatement()
  },
  place(path, appliedMutants) {
    const bodyStatements: Statement[] = [
      expressionStatement(
        mutationCoverageSequenceExpression(appliedMutants.keys()),
      ),
    ]
    if (path.node.type === 'BlockStatement') {
      bodyStatements.push(...path.node.body)
    } else {
      bodyStatements.push(path.node as Statement)
    }
    let statement: Statement = blockStatement(bodyStatements)
    for (const [mutant, appliedMutant] of appliedMutants) {
      statement = ifStatement(
        mutantTestExpression(mutant.id),
        blockStatement([nodeOfKind(mutant, appliedMutant, isStatementKind, 'a statement') as Statement]),
        statement,
      )
    }
    if (path.node.type === 'BlockStatement') {
      path.replaceWith(blockStatement([statement]))
    } else {
      path.replaceWith(statement)
    }
  },
}

export const switchCaseMutantPlacer: MutantPlacer = {
  name: 'switchCaseMutantPlacer',
  canPlace(path) {
    return nodeType(path.node) === 'SwitchCase'
  },
  place(path, appliedMutants) {
    const currentCase = path.node as unknown as { test: Expression | null; consequent: Statement[] }
    let consequence: Statement = blockStatement([
      expressionStatement(
        mutationCoverageSequenceExpression(appliedMutants.keys()),
      ),
      ...currentCase.consequent,
    ])
    for (const [mutant, appliedMutant] of appliedMutants) {
      const appliedCase = nodeOfKind(
        mutant,
        appliedMutant,
        (candidate) => nodeType(candidate) === 'SwitchCase',
        'a switch case',
      ) as unknown as { consequent: Statement[] }
      consequence = ifStatement(
        mutantTestExpression(mutant.id),
        blockStatement(appliedCase.consequent),
        consequence,
      )
    }
    path.replaceWith(switchCase(currentCase.test, [consequence]))
  },
}

export const allMutantPlacers: readonly MutantPlacer[] = Object.freeze([
  expressionMutantPlacer,
  statementMutantPlacer,
  switchCaseMutantPlacer,
])

const ANGULAR_SIGNAL_IO_FUNCTIONS = Object.freeze(['input', 'model', 'output'])

const ANGULAR_SIGNAL_QUERY_FUNCTIONS = Object.freeze([
  'contentChild',
  'contentChildren',
  'viewChild',
  'viewChildren',
])

const INPUT_MODEL_OUTPUT_CONFIG_MSG =
  'Angular signal based input, model and output functions configuration object cannot be mutated as that causes issues with the Angular compiler.'

const SIGNAL_QUERY_OPTIONS_MSG =
  'Angular signal query options object cannot be mutated as that causes issues with the Angular compiler.'

export function shouldIgnore(path: IgnorerNodePath): Option.Option<string> {
  for (let current: IgnorerNodePath | null | undefined = path; current; current = current.parentPath) {
    if (isInputModelOrOutputConfigurationObject(current)) {
      return Option.some(INPUT_MODEL_OUTPUT_CONFIG_MSG)
    }
    if (isSignalQueryOptionsObject(current)) {
      return Option.some(SIGNAL_QUERY_OPTIONS_MSG)
    }
  }
  return Option.none()
}

export const angularIgnorer: IgnorerService = {
  shouldIgnore,
}

function isClassFieldLike(path: IgnorerNodePath): boolean {
  const kind = nodeType(path.node)
  if (kind === 'PropertyDefinition' || kind === 'AccessorProperty') {
    return true
  }
  return kind === 'PropertyDefinition' &&
    Predicate.hasProperty(path.node, 'key') &&
    nodeType((path.node as unknown as Record<string, unknown>)['key']) === 'PrivateIdentifier'
}

function isInputModelOrOutputConfigurationObject(path: IgnorerNodePath): boolean {
  const parent = path.parentPath
  const grandParent = parent?.parentPath
  if (
    nodeType(path.node) !== 'ObjectExpression' ||
    parent === null ||
    parent === undefined ||
    nodeType(parent.node) !== 'CallExpression' ||
    grandParent === null ||
    grandParent === undefined ||
    nodeType(grandParent.node) !== 'PropertyDefinition'
  ) {
    return false
  }

  const callExpressionPath = parent
  const objectExpressionPath = path
  const callNode: unknown = callExpressionPath.node
  if (!Predicate.hasProperty(callNode, 'callee') || !Predicate.hasProperty(callNode, 'arguments')) {
    return false
  }
  const callee = callNode['callee']
  const args = callNode['arguments']
  if (!Array.isArray(args)) {
    return false
  }

  const isRequiredSignalIOFunction = isMemberExpressionWithIdentifier(callee, ANGULAR_SIGNAL_IO_FUNCTIONS, 'required')
  const isSignalIOFunction = isIdentifierIn(callee, ANGULAR_SIGNAL_IO_FUNCTIONS)
  const isOutput = isIdentifierWithName(callee, 'output')

  if (isRequiredSignalIOFunction || isOutput) {
    return args.length >= 1 && args[0] === objectExpressionPath.node
  }

  if (isSignalIOFunction) {
    return args.length >= 2 && args[1] === objectExpressionPath.node
  }

  return false
}

function isSignalQueryOptionsObject(path: IgnorerNodePath): boolean {
  const parent = path.parentPath
  const grandParent = parent?.parentPath
  if (
    nodeType(path.node) !== 'ObjectExpression' ||
    parent === null ||
    parent === undefined ||
    nodeType(parent.node) !== 'CallExpression' ||
    grandParent === null ||
    grandParent === undefined ||
    !isClassFieldLike(grandParent)
  ) {
    return false
  }

  const callExpressionPath = parent
  const objectExpressionPath = path
  const callNode: unknown = callExpressionPath.node
  if (!Predicate.hasProperty(callNode, 'callee') || !Predicate.hasProperty(callNode, 'arguments')) {
    return false
  }
  const callee = callNode['callee']
  const args = callNode['arguments']
  if (!Array.isArray(args)) {
    return false
  }
  const isQueryFn = isIdentifierIn(callee, ANGULAR_SIGNAL_QUERY_FUNCTIONS)
  const isRequiredQueryFn = isMemberExpressionWithIdentifier(callee, ANGULAR_SIGNAL_QUERY_FUNCTIONS, 'required')
  if (!isQueryFn && !isRequiredQueryFn) {
    return false
  }
  return args.length >= 2 && args[1] === objectExpressionPath.node
}

function isIdentifierWithName(node: unknown, name: string): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'Identifier' &&
    Predicate.hasProperty(node, 'name') &&
    node['name'] === name
  )
}

function isIdentifierIn(node: unknown, names: readonly string[]): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'Identifier' &&
    Predicate.hasProperty(node, 'name') &&
    typeof node['name'] === 'string' &&
    names.includes(node['name'])
  )
}

function isMemberExpressionWithIdentifier(
  node: unknown,
  objectNames: readonly string[],
  propertyName: string,
): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'MemberExpression' &&
    Predicate.hasProperty(node, 'object') &&
    Predicate.hasProperty(node, 'property') &&
    isIdentifierIn(node['object'], objectNames) &&
    isIdentifierWithName(node['property'], propertyName)
  )
}

export const strykerPlugins: readonly unknown[] = []

export const frameworkPluginsFileUrl = import.meta.url

const parsedInstrumentationHeader = parseSync(
  'instrumenter-header.js',
  `// @ts-nocheck
var ${STRYKER_NAMESPACE_HELPER} = function(){
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.${ID.NAMESPACE} || (g.${ID.NAMESPACE} = {});
  if (ns.${ID.ACTIVE_MUTANT} === undefined && g.process && g.process.env && g.process.env.${ID.ACTIVE_MUTANT_ENV_VARIABLE}) {
    ns.${ID.ACTIVE_MUTANT} = g.process.env.${ID.ACTIVE_MUTANT_ENV_VARIABLE};
  }
  function retrieveNS(){
    return ns;
  }
  ${STRYKER_NAMESPACE_HELPER} = retrieveNS;
  return retrieveNS();
};
${STRYKER_NAMESPACE_HELPER}();

var ${COVER_MUTANT_HELPER} = function() {
  var ns = ${STRYKER_NAMESPACE_HELPER}();
  var cov = ns.${ID.MUTATION_COVERAGE_OBJECT} || (ns.${ID.MUTATION_COVERAGE_OBJECT} = { static: {}, perTest: {} });
  function cover() {
    var c = cov.static;
    if (ns.${ID.CURRENT_TEST_ID}) {
      c = cov.perTest[ns.${ID.CURRENT_TEST_ID}] = cov.perTest[ns.${ID.CURRENT_TEST_ID}] || {};
    }
    var a = arguments;
    for(var i=0; i < a.length; i++){
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  ${COVER_MUTANT_HELPER} = cover;
  cover.apply(null, arguments);
};
var ${IS_MUTANT_ACTIVE_HELPER} = function(id) {
  var ns = ${STRYKER_NAMESPACE_HELPER}();
  function isActive(id) {
    if (ns.${ID.ACTIVE_MUTANT} === id) {
      if (ns.${ID.HIT_COUNT} !== void 0 && ++ns.${ID.HIT_COUNT} > ns.${ID.HIT_LIMIT}) {
        throw new Error('Stryker: Hit count limit reached (' + ns.${ID.HIT_COUNT} + ')');
      }
      return true;
    }
    return false;
  }
  ${IS_MUTANT_ACTIVE_HELPER} = isActive;
  return isActive(id);
}`,
  { lang: 'js', range: true },
)
if (parsedInstrumentationHeader.errors.length > 0) {
  throw new Error('Instrumentation header failed to parse')
}
export const instrumentationHeader: readonly Statement[] = parsedInstrumentationHeader.program
  .body as unknown as readonly Statement[]
deepFreeze(instrumentationHeader)

export function placeHeaderIfNeeded(
  mutantCollector: MutantCollector,
  originFileName: string,
  options: MutatorOptions,
  root: Program,
): void {
  if (hasPlacedMutants(mutantCollector, originFileName) && options.noHeader !== true) {
    placeHeader(root)
  }
}

export function placeHeader(root: Program): void {
  let header: readonly Statement[] = instrumentationHeader
  const firstStatement = root.body[0]
  const leadingComments = (firstStatement as { leadingComments?: unknown } | undefined)?.leadingComments
  if (Array.isArray(leadingComments)) {
    const firstHeader = instrumentationHeader[0]
    if (firstHeader === undefined) {
      throw new Error('Instrumentation header is empty')
    }
    const cloned = cloneNode(firstHeader) as unknown as { leadingComments?: unknown }
    cloned.leadingComments = leadingComments
    header = [cloned as unknown as Statement, ...instrumentationHeader.slice(1)]
  }
  root.body.unshift(...header)
}

function deepFreeze(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item)
      }
      return Object.freeze(value)
    }
    if (value instanceof RegExp) {
      return Object.freeze(value)
    }
    if (value instanceof Map) {
      for (const [k, v] of value.entries()) {
        deepFreeze(k)
        deepFreeze(v)
      }
      return Object.freeze(value)
    }
    if (value instanceof Set) {
      for (const v of value.values()) {
        deepFreeze(v)
      }
      return Object.freeze(value)
    }
    for (const v of Object.values(value)) {
      deepFreeze(v)
    }
    return Object.freeze(value)
  }
  return value
}

export function transform(
  ast: Ast,
  mutantCollector: MutantCollector,
  transformerContext: Omit<TransformerContext, 'transform'>,
): readonly string[] {
  const context: TransformerContext = {
    ...transformerContext,
    transform,
  }
  switch (ast.format) {
    case 'html':
      return transformHtml(ast, mutantCollector, context)
    case 'js':
    case 'ts':
    case 'tsx':
      return transformScript(ast, mutantCollector, context)
    case 'svelte':
      return transformSvelte(ast, mutantCollector, context)
  }
}

export type AstTransformer<T extends AstFormat> = (
  ast: AstByFormat[T],
  mutantCollector: MutantCollector,
  context: TransformerContext,
) => readonly string[]

export interface TransformerContext {
  transform: AstTransformer<AstFormat>
  options: TransformerOptions
  mutateDescription: MutateDescription
}

export const transformHtml: AstTransformer<'html'> = (
  { root },
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  root.scripts.forEach((ast) => {
    warnings.push(...context.transform(ast, mutantCollector, context))
  })
  return warnings
}

const moduleScriptStart = '<script context="module">\n'
const moduleScript = `${moduleScriptStart}\n</script>\n`

export const transformSvelte: AstTransformer<'svelte'> = (
  svelte,
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  const { root, originFileName } = svelte
  ;[root.moduleScript, ...root.additionalScripts]
    .filter(Predicate.isNotNullish)
    .forEach((script) => {
      warnings.push(
        ...context.transform(script.ast, mutantCollector, {
          ...context,
          options: {
            ...context.options,
            noHeader: true,
          },
        }),
      )
    })

  if (hasPlacedMutants(mutantCollector, originFileName)) {
    if (!root.moduleScript) {
      root.moduleScript = {
        ast: {
          format: 'js',
          root: emptyProgram(),
          comments: [],
          rawContent: '',
          originFileName,
        },
        range: {
          start: moduleScriptStart.length,
          end: moduleScriptStart.length,
        },
        isExpression: false,
      }
      svelte.rawContent = `${moduleScript}${svelte.rawContent}`
      svelte.root.additionalScripts.forEach((script) => {
        script.range.start += moduleScript.length
        script.range.end += moduleScript.length
      })
    }
    placeHeader(root.moduleScript.ast.root)
  }
  return warnings
}

function emptyProgram(): Program {
  return { type: 'Program', sourceType: 'module', body: [] }
}

interface MutantsPlacement {
  appliedMutants: Map<Mutant, Node>
  placer: MutantPlacer
}

type PlacementMap = Map<Node, MutantsPlacement>

export const transformScript: AstTransformer<ScriptFormat> = (
  { root, originFileName, rawContent, offset, comments },
  mutantCollector,
  { options, mutateDescription },
  mutators = allMutators,
  mutantPlacers = allMutantPlacers,
) => {
  const lineTable = buildLineTable(rawContent)

  attachComments(root, comments as readonly AttachedComment[], lineTable)

  const placementMap: PlacementMap = new Map()

  let directiveRule: Rule = rootRule
  const mutatorEntries = Object.entries(mutators)
  const allMutatorNames = mutatorEntries.map(([name]) => name.toLowerCase())

  const warnings: string[] = []

  traverse(root, {
    enter(path) {
      const result = processStrykerDirectives(
        directiveRule,
        path.node,
        allMutatorNames,
        originFileName,
      )
      directiveRule = result.rule
      warnings.push(...result.warnings)
      if (shouldSkip(path)) {
        path.skip()
      } else {
        addToPlacementMapIfPossible(path)
        if (shouldMutate(path)) {
          const mutantsToPlace = collectMutants(path)
          if (mutantsToPlace.length > 0) {
            const placementPath = path.find((ancestor) => placementMap.has(ancestor.node))
            if (placementPath) {
              const placement = placementMap.get(placementPath.node)
              if (placement === undefined) {
                throw new Error('Placement not found for node')
              }
              const { appliedMutants } = placement
              mutantsToPlace.forEach((mutant) => appliedMutants.set(mutant, applyMutant(mutant, placementPath.node)))
            } else {
              throw new Error(
                `Mutants cannot be placed. This shouldn't happen! Unplaced mutants: ${
                  JSON.stringify(mutantsToPlace, null, 2)
                }`,
              )
            }
          }
        }
      }
    },
    exit(path) {
      placeMutantsIfNeeded(path)
    },
  })

  placeHeaderIfNeeded(mutantCollector, originFileName, options, root)

  return warnings

  function addToPlacementMapIfPossible(path: TraversePath): void {
    const placer = mutantPlacers.find((p) => p.canPlace(path))
    if (placer !== undefined) {
      placementMap.set(path.node, { appliedMutants: new Map(), placer })
    }
  }
  function shouldSkip(path: TraversePath): boolean {
    return (
      isTypeNode(path) ||
      isImportDeclaration(path) ||
      nodeType(path.node) === 'Decorator' ||
      mutateDescription === false ||
      (Array.isArray(mutateDescription) &&
        mutateDescription.every((range: SourceLocationInFile) => {
          const nodeLoc: SourceLocationInFile = getNodeLocation(path.node)
          return !locationOverlaps(range, nodeLoc)
        }))
    )
  }

  function shouldMutate(path: TraversePath): boolean {
    return (
      mutateDescription === true ||
      (Array.isArray(mutateDescription) &&
        mutateDescription.some((range: SourceLocationInFile) => {
          const nodeLoc: SourceLocationInFile = getNodeLocation(path.node)
          return locationIncluded(range, nodeLoc)
        }))
    )
  }

  function getNodeLocation(node: Node): SourceLocationInFile {
    const span = spanOf(node)
    if (span === undefined) {
      throw new Error('Node without a span')
    }
    return {
      start: positionFromLineTable(span.start, lineTable),
      end: positionFromLineTable(span.end, lineTable),
    }
  }

  function placeMutantsIfNeeded(path: TraversePath): void {
    const mutantsPlacement = placementMap.get(path.node)
    if (mutantsPlacement !== undefined && mutantsPlacement.appliedMutants.size > 0) {
      try {
        mutantsPlacement.placer.place(path, mutantsPlacement.appliedMutants)
        path.skip()
      } catch (error) {
        const normalizedError = toError(error)
        throwPlacementError(
          normalizedError,
          path,
          mutantsPlacement.placer,
          [...mutantsPlacement.appliedMutants.keys()],
          originFileName,
          lineTable,
        )
      }
    }
  }
  function ignoreMessageFor(path: TraversePath): string | undefined {
    const view = toIgnorerPath(path)
    for (const ignorer of options.ignorers) {
      const result = ignorer.shouldIgnore(view)
      if (Option.isSome(result)) {
        return result.value
      }
    }
    return undefined
  }

  function collectMutants(path: TraversePath): Mutant[] {
    return [...mutate(path)].map((mutable) =>
      collect(mutantCollector, originFileName, path.node, mutable, offset, lineTable)
    )
      .filter((mutant) => mutant.ignoreReason === undefined)
  }

  function* mutate(path: TraversePath): Iterable<Mutable> {
    const context = toMutatorContext(path)
    for (const [mutatorName, mutate] of mutatorEntries) {
      for (const replacement of mutate(path.node, context)) {
        const ignoreReason = findIgnoreReason(directiveRule, mutatorName, getNodeLocation(path.node).start.line) ??
          findExcludedMutatorIgnoreReason(mutatorName) ??
          ignoreMessageFor(path)
        const mutableEntry: Mutable = {
          replacement,
          mutatorName,
        }
        if (ignoreReason !== undefined) {
          mutableEntry.ignoreReason = ignoreReason
        }
        yield mutableEntry
      }
    }

    function findExcludedMutatorIgnoreReason(mutatorName: string): string | undefined {
      if (options.excludedMutations.includes(mutatorName)) {
        return `Ignored because of excluded mutation "${mutatorName}"`
      } else {
        return undefined
      }
    }
  }
}

function toMutatorContext(path: TraversePath): MutatorContext {
  const ancestors: Node[] = []
  let current: TraversePath | null = path.parentPath
  while (current !== null) {
    ancestors.push(current.node)
    current = current.parentPath
  }
  return {
    parent: ancestors[0],
    grandParent: ancestors[1],
    ancestors,
  }
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  return new Error('Unexpected error', { cause: value })
}
