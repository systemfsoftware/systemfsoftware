// oxlint-disable typescript/no-unsafe-type-assertion typescript/no-unnecessary-type-assertion

import { type IgnorerService, type NodePath as IgnorerNodePath } from '@systemfsoftware/stryker-js'
import { INSTRUMENTER_CONSTANTS as ID } from '@systemfsoftware/stryker-js'
import { type MutateDescription, type Position } from '@systemfsoftware/stryker-js'
import { propertyPath, type StrykerOptions, strykerReportBugUrl } from '@systemfsoftware/stryker-js'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import type {
  ArrowFunctionExpression,
  ClassExpression,
  Comment,
  Expression,
  FunctionExpression,
  Identifier,
  MemberExpression,
  Node,
  Program,
  Statement,
} from 'estree'
import path from 'node:path'

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
import { parseWithOxc } from './Parser.js'
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
  offset?: Position,
  lineTable?: readonly number[],
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
const NO_CHILDREN: readonly unknown[] = Object.freeze([])

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

type IgnoreRule = Extract<Rule, { kind: 'Ignore' }>
type RestoreRule = Extract<Rule, { kind: 'Restore' }>

export function findIgnoreReason(
  rule: Rule,
  mutatorName: string,
  line: number,
): string | undefined {
  return Option.getOrUndefined(ignoreReasonIn(rule, mutatorName.toLowerCase(), line))
}

function ignoreReasonIn(
  rule: Rule,
  lowerMutatorName: string,
  line: number,
): Option.Option<string> {
  return Match.value(rule).pipe(
    Match.when({ kind: 'Ignore' }, (ignore) => directiveOutcome(ignore, lowerMutatorName, line)),
    Match.when({ kind: 'Restore' }, (restore) => directiveOutcome(restore, lowerMutatorName, line)),
    Match.when({ kind: 'Root' }, () => Option.none<string>()),
    Match.exhaustive,
  )
}

function directiveOutcome(
  directive: IgnoreRule | RestoreRule,
  lowerMutatorName: string,
  line: number,
): Option.Option<string> {
  return Match.value(directiveApplies(directive, lowerMutatorName, line)).pipe(
    Match.when(false, () => ignoreReasonIn(directive.previous, lowerMutatorName, line)),
    Match.when(true, () =>
      Match.value(directive).pipe(
        Match.when({ kind: 'Ignore' }, (ignore) => Option.some(ignore.ignoreReason)),
        Match.when({ kind: 'Restore' }, () => Option.none<string>()),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

/** A directive applies when its line — where it declares one — and one of its mutator names match. */
function directiveApplies(
  directive: IgnoreRule | RestoreRule,
  lowerMutatorName: string,
  line: number,
): boolean {
  return Option.match(Option.fromNullishOr(directive.line), {
    onNone: () => true,
    onSome: (directiveLine) => directiveLine === line,
  }) && directive.mutatorNames.some((name) => name === lowerMutatorName || name === WILDCARD)
}

interface LocatedComment extends Comment {
  readonly loc?: {
    readonly start: { readonly line: number; readonly column: number }
    readonly end: { readonly line: number; readonly column: number }
  }
}

interface StrykerDirective {
  readonly type: string
  readonly scope: string | undefined
  readonly mutatorNames: readonly string[]
  readonly reason: string
  readonly loc: LocatedComment['loc']
}

interface NodeWithLeadingComments {
  readonly leadingComments?: readonly LocatedComment[]
}

const NO_COMMENTS: readonly LocatedComment[] = []
const PARSE_FAILURE = 'Stryker directive without directive type or mutators'
const MISSING_LOCATION = 'Comment without location'

export function processStrykerDirectives(
  rule: Rule,
  node: Node,
  allMutatorNames: readonly string[],
  originFileName: string,
): { rule: Rule; warnings: readonly string[] } {
  const directives = attachedComments(node).map(parseStrykerDirective).flatMap(Option.toArray)
  const warnings = directives.flatMap((directive) => mutatorWarnings(directive, allMutatorNames, originFileName))
  return { rule: directives.reduce(applyStrykerDirective, rule), warnings }
}

function attachedComments(node: Node): readonly LocatedComment[] {
  const host = node as NodeWithLeadingComments
  return host.leadingComments ?? NO_COMMENTS
}

/** A comment that matched the directive grammar, decoded into the fields a rule needs. */
function parseStrykerDirective(comment: LocatedComment): Option.Option<StrykerDirective> {
  return Option.map(
    Option.fromNullishOr(strykerCommentDirectiveRegex.exec(comment.value)),
    (match) => strykerDirective(match, comment.loc),
  )
}

function strykerDirective(match: RegExpExecArray, loc: LocatedComment['loc']): StrykerDirective {
  return {
    type: matchGroup(match, 1),
    scope: match[2],
    mutatorNames: matchGroup(match, 3).split(',').map((mutator) => mutator.trim()),
    reason: (match[4] ?? DEFAULT_REASON).trim(),
    loc,
  }
}

function matchGroup(match: RegExpExecArray, group: number): string {
  return Option.getOrThrowWith(Option.fromNullishOr(match[group]), () => new Error(PARSE_FAILURE))
}

function applyStrykerDirective(rule: Rule, directive: StrykerDirective): Rule {
  return Match.value(directive.type).pipe(
    Match.when('disable', () => ignoreRuleFor(rule, directive)),
    Match.when('restore', () => restoreRuleFor(rule, directive)),
    Match.orElse(() => rule),
  )
}

function ignoreRuleFor(rule: Rule, directive: StrykerDirective): Rule {
  return {
    kind: 'Ignore',
    mutatorNames: directive.mutatorNames.map((mutatorName) => mutatorName.toLowerCase()),
    line: directiveLine(directive),
    ignoreReason: directive.reason,
    previous: rule,
  }
}

function restoreRuleFor(rule: Rule, directive: StrykerDirective): Rule {
  return {
    kind: 'Restore',
    mutatorNames: directive.mutatorNames.map((mutatorName) => mutatorName.toLowerCase()),
    line: directiveLine(directive),
    previous: rule,
  }
}

/** `next-line` directives carry the line they were written on; a block directive carries none. */
function directiveLine(directive: StrykerDirective): number | undefined {
  return Match.value(directive.scope).pipe(
    Match.when('next-line', () => commentLocation(directive.loc).start.line),
    Match.orElse(() => undefined),
  )
}

function commentLocation(loc: LocatedComment['loc']): NonNullable<LocatedComment['loc']> {
  return Option.getOrThrowWith(Option.fromNullishOr(loc), () => new Error(MISSING_LOCATION))
}

/** Warnings for the directive's mutator names that the configured mutators do not know. */
function mutatorWarnings(
  directive: StrykerDirective,
  allMutatorNames: readonly string[],
  originFileName: string,
): readonly string[] {
  return directive.mutatorNames
    .filter((mutatorName) => mutatorName !== WILDCARD)
    .filter((mutatorName) => !allMutatorNames.includes(mutatorName.toLowerCase()))
    .map((mutatorName) => mutatorWarning(directive, mutatorName, originFileName))
}

function mutatorWarning(directive: StrykerDirective, mutatorName: string, originFileName: string): string {
  const loc = commentLocation(directive.loc)
  const label = Option.match(Option.filter(Option.fromNullishOr(directive.scope), (scope) => scope !== ''), {
    onNone: () => directive.type,
    onSome: (scope) => `${directive.type} ${scope}`,
  })
  return `Unused 'Stryker ${label}' directive. Mutator with name '${mutatorName}' not found. Directive found at: ${originFileName}:${loc.start.line}:${loc.start.column}.`
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
        nodeType(propertyKeyOf(node)) === 'PrivateIdentifier'
    },
    isClassAccessorProperty(): boolean {
      return nodeType(node) === 'AccessorProperty'
    },
  }
  return result
}

function propertyKeyOf(node: unknown): unknown {
  return Option.getOrUndefined(
    Option.map(Option.filter(Option.some(node), Predicate.hasProperty('key')), (holder) => holder['key']),
  )
}

export function isTypeNode(path: TraversePath): boolean {
  return [
    tsTypeAnnotationNodeTypes.includes(path.node.type),
    flowTypeAnnotationNodeTypes.includes(path.node.type),
    isDeclareVariableStatement(path.node),
    isDeclareModule(path.node),
  ].some((isType) => isType)
}

function isDeclareVariableStatement(node: Node): boolean {
  return isDeclared(node) && nodeType(node) === 'VariableDeclaration'
}

function isDeclareModule(node: Node): boolean {
  return isDeclared(node) && nodeType(node) === 'TSModuleDeclaration'
}

function isDeclared(node: Node): boolean {
  return 'declare' in node && node.declare === true
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
  const message = `${placer.name} could not place mutants with type(s): "${
    new Intl.ListFormat('en').format(mutants.map((mutant) => mutant.mutatorName))
  }"`
  const errorMessage = `${
    placementLocation(nodePath.node, fileName, lineTable)
  } ${message}. Either remove this file from the list of files to be mutated, or exclude the mutator (using ${
    propertyPath<StrykerOptions>()(
      'mutator',
      'excludedMutations',
    )
  }). Please report this issue at ${strykerReportBugUrl(message)}. Original error: ${error.stack}`
  throw new Error(errorMessage)
}

function placementLocation(node: Node, fileName: string, lineTable: readonly number[]): string {
  const relativeFile = path.relative(process.cwd(), fileName)
  const position = Option.map(
    Option.fromNullishOr(spanOf(node)),
    (span) => positionFromLineTable(span.start, lineTable),
  )
  return Option.match(position, {
    onNone: () => `${relativeFile}:undefined:undefined`,
    onSome: (at) => `${relativeFile}:${at.line}:${at.column}`,
  })
}

type AnonymousFunctionOrClass = FunctionExpression | ClassExpression

function classOrFunctionExpressionNamedIfNeeded(path: TraversePath): Expression | undefined {
  return Match.value(path.node).pipe(
    Match.when(isAnonymousFunctionOrClass, (node) => nameFromParent(path, node)),
    Match.orElse(() => undefined),
  )
}

function nameFromParent(path: TraversePath, node: AnonymousFunctionOrClass): Expression | undefined {
  return Match.value(path.parentPath?.node).pipe(
    Match.when(
      { type: 'VariableDeclarator', id: { type: 'Identifier' } },
      (declarator) => adoptIdentifier(node, declarator.id),
    ),
    Match.when({ type: 'Property', key: { type: 'Identifier' } }, () => namedPropertyValue(path, node)),
    Match.orElse(() => undefined),
  )
}

/** A property value only survives by name when the declaration above it carries one. */
function namedPropertyValue(path: TraversePath, node: AnonymousFunctionOrClass): Expression | undefined {
  return Match.value(path.getStatementParent()?.node.type).pipe(
    Match.when('VariableDeclaration', () => node),
    Match.orElse(() => undefined),
  )
}

function adoptIdentifier(node: AnonymousFunctionOrClass, identifier: Identifier): Expression {
  node.id = identifier
  return node
}

function isAnonymousFunctionOrClass(node: Node): node is AnonymousFunctionOrClass {
  return isFunctionOrClassExpression(node) && node.id == null
}

function isFunctionOrClassExpression(node: Node): node is AnonymousFunctionOrClass {
  return node.type === 'FunctionExpression' || node.type === 'ClassExpression'
}

function arrowFunctionExpressionNamedIfNeeded(path: TraversePath): Expression | undefined {
  return Match.value(path.node).pipe(
    Match.when({ type: 'ArrowFunctionExpression' }, (node) => arrowNamedByDeclarator(node, path.parentPath)),
    Match.orElse(() => undefined),
  )
}

/** An arrow bound to a named declaration is re-emitted as a named function. */
function arrowNamedByDeclarator(
  node: ArrowFunctionExpression,
  parentPath: TraversePath | null,
): Expression | undefined {
  return Option.match(declaratorIdentifier(parentPath), {
    onNone: () => undefined,
    onSome: (identifier) => namedArrowExpression(node, identifier),
  })
}

function namedArrowExpression(node: ArrowFunctionExpression, identifier: Identifier): Expression {
  const declaration = variableDeclaration('const', [variableDeclarator(identifier, node)])
  return callExpression(
    arrowFunctionExpression([], blockStatement([declaration, returnStatement(identifier)])),
    [],
  )
}

function declaratorIdentifier(parentPath: TraversePath | null): Option.Option<Identifier> {
  return Option.flatMap(Option.fromNullishOr(parentPath), (parent) =>
    Match.value(parent.node).pipe(
      Match.when(
        { type: 'VariableDeclarator', id: { type: 'Identifier' } },
        (declarator) => Option.some(declarator.id),
      ),
      Match.orElse(() => Option.none<Identifier>()),
    ))
}

function nameIfAnonymous(path: TraversePath): Expression {
  return classOrFunctionExpressionNamedIfNeeded(path) ?? arrowNameOrNode(path)
}

function arrowNameOrNode(path: TraversePath): Expression {
  return arrowFunctionExpressionNamedIfNeeded(path) ?? (path.node as Expression)
}

function isChainLink(node: Node | undefined): boolean {
  return [isMemberExpressionNode(node), isCallExpressionNode(node), isNonNullExpression(node)].some((holds) => holds)
}

function isMemberExpressionNode(node: Node | undefined): boolean {
  return nodeType(node) === 'MemberExpression'
}

function isCallExpressionNode(node: Node | undefined): boolean {
  return nodeType(node) === 'CallExpression'
}

function isNonNullExpression(node: Node | undefined): boolean {
  return nodeType(node) === 'TSNonNullExpression'
}

function isValidExpression(path: TraversePath): boolean {
  const parent = path.parentPath
  return parent === null || !isUnmutatableContext(path, parent)
}

function isUnmutatableContext(path: TraversePath, parent: TraversePath): boolean {
  return [
    isObjectPropertyKey(path, parent),
    isPartOfChain(path, parent),
    isTaggedTemplateTag(parent),
    isDeletedOperand(path, parent),
    isAssignedTarget(path, parent),
  ].some((invalid) => invalid)
}

function isObjectPropertyKey(path: TraversePath, parent: TraversePath): boolean {
  const parentNode = parent.node
  return parentNode.type === 'Property' && parentNode.key === path.node
}

function isTaggedTemplateTag(parent: TraversePath): boolean {
  return parent.node.type === 'TaggedTemplateExpression'
}

function isDeletedOperand(path: TraversePath, parent: TraversePath): boolean {
  const parentNode = parent.node
  return parentNode.type === 'UnaryExpression' && parentNode.operator === 'delete'
}

function isAssignedTarget(path: TraversePath, parent: TraversePath): boolean {
  const parentNode = parent.node
  return parentNode.type === 'AssignmentExpression' && parentNode.left === path.node
}

function isPartOfChain(path: TraversePath, parent: TraversePath): boolean {
  return isChainLink(path.node) && chainContinuesIn(path, parent)
}

function chainContinuesIn(path: TraversePath, parent: TraversePath): boolean {
  return [
    isMemberAccessParent(path, parent),
    isNonNullExpression(parent.node),
    isCalleeParent(path, parent),
  ].some((continues) => continues)
}

function isMemberAccessParent(path: TraversePath, parent: TraversePath): boolean {
  const parentNode = parent.node
  return parentNode.type === 'MemberExpression' && isNotACallOnTheNode(parentNode, path.node)
}

function isCalleeParent(path: TraversePath, parent: TraversePath): boolean {
  const parentNode = parent.node
  return parentNode.type === 'CallExpression' && parentNode.callee === path.node
}

function isNotACallOnTheNode(member: MemberExpression, node: Node): boolean {
  return !(member.computed && member.property === node)
}

export function unwrapParenthesizedExpression(node: Node): Node {
  return Option.getOrElse(innerExpression(node), () => node)
}

interface ParenthesizedWrapper {
  readonly expression?: Node | null
}

function innerExpression(node: Node): Option.Option<Node> {
  return Option.flatMap(
    Option.filter(Option.some<unknown>(node), isParenthesizedWrapper),
    (parenthesized) => Option.map(Option.fromNullishOr(parenthesized.expression), unwrapParenthesizedExpression),
  )
}

function isParenthesizedWrapper(value: unknown): value is ParenthesizedWrapper {
  return Predicate.hasProperty(value, 'type') && value['type'] === 'ParenthesizedExpression'
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
    const body = [expressionStatement(mutationCoverageSequenceExpression(appliedMutants.keys())), ...statementsOf(path)]
    const statement = [...appliedMutants].reduce(guardedStatement, blockStatement(body))
    path.replaceWith(wrappedStatement(path, statement))
  },
}

function statementsOf(path: TraversePath): readonly Statement[] {
  const node = path.node
  if (node.type === 'BlockStatement') {
    return node.body
  }
  return [node as Statement]
}

function guardedStatement(statement: Statement, entry: readonly [Mutant, Node]): Statement {
  return ifStatement(
    mutantTestExpression(entry[0].id),
    blockStatement([nodeOfKind(entry[0], entry[1], isStatementKind, 'a statement') as Statement]),
    statement,
  )
}

function wrappedStatement(path: TraversePath, statement: Statement): Statement {
  return Match.value(nodeType(path.node)).pipe(
    Match.when('BlockStatement', () => blockStatement([statement])),
    Match.orElse(() => statement),
  )
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
  return Option.orElse(reasonAt(path), () => ancestorReason(path))
}

function reasonAt(path: IgnorerNodePath): Option.Option<string> {
  return Match.value(path).pipe(
    Match.when(isInputModelOrOutputConfigurationObject, () => Option.some(INPUT_MODEL_OUTPUT_CONFIG_MSG)),
    Match.when(isSignalQueryOptionsObject, () => Option.some(SIGNAL_QUERY_OPTIONS_MSG)),
    Match.orElse(() => Option.none<string>()),
  )
}

function ancestorReason(path: IgnorerNodePath): Option.Option<string> {
  return Option.flatMap(Option.fromNullishOr(path.parentPath), shouldIgnore)
}

export const angularIgnorer: IgnorerService = {
  shouldIgnore,
}

function isClassFieldLike(path: IgnorerNodePath): boolean {
  return CLASS_FIELD_KINDS.includes(nodeType(path.node) ?? '')
}

const CLASS_FIELD_KINDS: readonly string[] = Object.freeze(['PropertyDefinition', 'AccessorProperty'])

interface SignalCallSite {
  readonly callee: unknown
  readonly args: readonly unknown[]
  readonly objectExpression: IgnorerNodePath
}

function isInputModelOrOutputConfigurationObject(path: IgnorerNodePath): boolean {
  return Option.match(signalCallSiteOf(path, isPropertyDefinitionField), {
    onNone: () => false,
    onSome: (site) => isArgumentAt(site, signalIoArgumentIndex(site.callee)),
  })
}

function isSignalQueryOptionsObject(path: IgnorerNodePath): boolean {
  return Option.match(signalCallSiteOf(path, isClassFieldLike), {
    onNone: () => false,
    onSome: (site) => isSignalQueryCall(site.callee) && isArgumentAt(site, Option.some(1)),
  })
}

function isPropertyDefinitionField(path: IgnorerNodePath): boolean {
  return nodeType(path.node) === 'PropertyDefinition'
}

/** The call that takes the object expression as an argument, when a field-like member owns it. */
function signalCallSiteOf(
  path: IgnorerNodePath,
  ownsCallSite: (owner: IgnorerNodePath) => boolean,
): Option.Option<SignalCallSite> {
  return Option.flatMap(
    ownedCallPath(path, ownsCallSite),
    (callPath) => Option.map(callArgumentsOf(callPath), (call) => ({ ...call, objectExpression: path })),
  )
}

function ownedCallPath(
  path: IgnorerNodePath,
  ownsCallSite: (owner: IgnorerNodePath) => boolean,
): Option.Option<IgnorerNodePath> {
  const argument = Option.filter(Option.some(path), (candidate) => isOwnedCallArgument(candidate, ownsCallSite))
  return Option.flatMap(argument, (candidate) => Option.fromNullishOr(candidate.parentPath))
}

function isOwnedCallArgument(path: IgnorerNodePath, ownsCallSite: (owner: IgnorerNodePath) => boolean): boolean {
  return isObjectArgumentOfCall(path) && ownsCallSiteOf(path, ownsCallSite)
}

function isObjectArgumentOfCall(path: IgnorerNodePath): boolean {
  return nodeType(path.node) === 'ObjectExpression' && parentIsCallExpression(path)
}

function parentIsCallExpression(path: IgnorerNodePath): boolean {
  return nodeType(path.parentPath?.node) === 'CallExpression'
}

function ownsCallSiteOf(path: IgnorerNodePath, ownsCallSite: (owner: IgnorerNodePath) => boolean): boolean {
  return Option.exists(Option.fromNullishOr(path.parentPath?.parentPath), ownsCallSite)
}

interface CallArguments {
  readonly callee: unknown
  readonly args: readonly unknown[]
}

function callArgumentsOf(callPath: IgnorerNodePath): Option.Option<CallArguments> {
  return Option.flatMap(
    Option.filter(Option.some(callPath.node), hasCallShape),
    (call) => Option.map(argumentArrayOf(call['arguments']), (args) => ({ callee: call['callee'], args })),
  )
}

function hasCallShape(callNode: unknown): callNode is { readonly callee: unknown; readonly arguments: unknown } {
  return Predicate.hasProperty(callNode, 'callee') && Predicate.hasProperty(callNode, 'arguments')
}

function argumentArrayOf(argument: unknown): Option.Option<readonly unknown[]> {
  return Option.filter(Option.some(argument), isUnknownArray)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function signalIoArgumentIndex(callee: unknown): Option.Option<number> {
  return Match.value(callee).pipe(
    Match.when(isRequiredSignalIoCall, () => Option.some(0)),
    Match.when(isOutputCall, () => Option.some(0)),
    Match.when(isSignalIoCall, () => Option.some(1)),
    Match.orElse(() => Option.none<number>()),
  )
}

function isRequiredSignalIoCall(callee: unknown): boolean {
  return isMemberExpressionWithIdentifier(callee, ANGULAR_SIGNAL_IO_FUNCTIONS, 'required')
}

function isOutputCall(callee: unknown): boolean {
  return isIdentifierWithName(callee, 'output')
}

function isSignalIoCall(callee: unknown): boolean {
  return isIdentifierIn(callee, ANGULAR_SIGNAL_IO_FUNCTIONS)
}

function isSignalQueryCall(callee: unknown): boolean {
  return isIdentifierIn(callee, ANGULAR_SIGNAL_QUERY_FUNCTIONS) ||
    isMemberExpressionWithIdentifier(callee, ANGULAR_SIGNAL_QUERY_FUNCTIONS, 'required')
}

function isArgumentAt(site: SignalCallSite, index: Option.Option<number>): boolean {
  return Option.exists(
    index,
    (position) => site.args.length > position && site.args[position] === site.objectExpression.node,
  )
}

function isIdentifierWithName(node: unknown, name: string): boolean {
  return Option.contains(identifierName(node), name)
}

function isIdentifierIn(node: unknown, names: readonly string[]): boolean {
  return Option.exists(identifierName(node), (name) => names.includes(name))
}

function identifierName(node: unknown): Option.Option<string> {
  return Option.map(identifierNode(node), (identifier) => identifier.name)
}

function identifierNode(node: unknown): Option.Option<{ readonly name: string }> {
  return Option.filter(Option.some(node), isNamedIdentifier)
}

function isNamedIdentifier(node: unknown): node is { readonly name: string } {
  return hasNodeType(node, 'Identifier') && isStringProperty(node, 'name')
}

function hasNodeType(node: unknown, type: string): boolean {
  return Predicate.hasProperty(node, 'type') && node['type'] === type
}

function isStringProperty(node: unknown, property: string): boolean {
  return Predicate.hasProperty(node, property) && typeof node[property] === 'string'
}

function isMemberExpressionWithIdentifier(
  node: unknown,
  objectNames: readonly string[],
  propertyName: string,
): boolean {
  return Option.exists(
    memberPartsOf(node),
    (member) => isIdentifierIn(member.object, objectNames) && isIdentifierWithName(member.property, propertyName),
  )
}

interface MemberParts {
  readonly object: unknown
  readonly property: unknown
}

function memberPartsOf(node: unknown): Option.Option<MemberParts> {
  return Option.filter(Option.some(node), isMemberExpressionRecord)
}

function isMemberExpressionRecord(node: unknown): node is MemberParts {
  return hasNodeType(node, 'MemberExpression') && isPropertyBearing(node)
}

function isPropertyBearing(node: unknown): node is { readonly object: unknown; readonly property: unknown } {
  return Predicate.hasProperty(node, 'object') && Predicate.hasProperty(node, 'property')
}

export const strykerPlugins: readonly unknown[] = []

export const frameworkPluginsFileUrl = import.meta.url

const INSTRUMENTATION_HEADER_SOURCE = `// @ts-nocheck
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
}`

let instrumentationHeaderValue: readonly Statement[] | undefined

const instrumentationHeader = async (): Promise<readonly Statement[]> => {
  if (instrumentationHeaderValue === undefined) {
    const parsed = await parseWithOxc(INSTRUMENTATION_HEADER_SOURCE, 'instrumenter-header.js', 'js')
    instrumentationHeaderValue = parsed.root.body as unknown as readonly Statement[]
    deepFreeze(instrumentationHeaderValue)
  }
  return instrumentationHeaderValue
}

export async function placeHeaderIfNeeded(
  mutantCollector: MutantCollector,
  originFileName: string,
  options: MutatorOptions,
  root: Program,
): Promise<void> {
  if (shouldPlaceHeader(mutantCollector, originFileName, options)) {
    await placeHeader(root)
  }
}

function shouldPlaceHeader(
  mutantCollector: MutantCollector,
  originFileName: string,
  options: MutatorOptions,
): boolean {
  return hasPlacedMutants(mutantCollector, originFileName) && options.noHeader !== true
}

export async function placeHeader(root: Program): Promise<void> {
  root.body.unshift(...(await headerFor(root)))
}

interface CommentBearing {
  leadingComments?: unknown
}

async function headerFor(root: Program): Promise<readonly Statement[]> {
  const header = await instrumentationHeader()
  return Option.match(leadingCommentsOf(root), {
    onNone: () => header,
    onSome: (leadingComments) => [commentedHeader(leadingComments, header), ...header.slice(1)],
  })
}

function leadingCommentsOf(root: Program): Option.Option<readonly unknown[]> {
  const firstStatement = root.body[0] as CommentBearing | undefined
  return Option.filter(Option.fromNullishOr(firstStatement?.leadingComments), isUnknownArray)
}

function commentedHeader(leadingComments: readonly unknown[], header: readonly Statement[]): Statement {
  const firstHeader = Option.getOrThrowWith(
    Option.fromNullishOr(header[0]),
    () => new Error('Instrumentation header is empty'),
  )
  const cloned = cloneNode(firstHeader) as unknown as CommentBearing
  cloned.leadingComments = leadingComments
  return cloned as unknown as Statement
}

function deepFreeze(value: unknown): unknown {
  return Option.match(frozenContainer(value), {
    onNone: () => value,
    onSome: (frozen) => frozen,
  })
}

function frozenContainer(value: unknown): Option.Option<unknown> {
  return Option.map(Option.filter(Option.some(value), isObjectValue), (object) => {
    freezableChildren(object).forEach((child) => {
      deepFreeze(child)
    })
    return Object.freeze(object)
  })
}

function freezableChildren(value: object): readonly unknown[] {
  return [...mapEntries(value), ...setItems(value), ...Object.values(value as Record<string, unknown>)]
}

function mapEntries(value: object): readonly unknown[] {
  return Option.getOrElse(
    Option.map(Option.filter(Option.some(value), isMap), (map) => [...map.entries()].flat()),
    () => NO_CHILDREN,
  )
}

function setItems(value: object): readonly unknown[] {
  return Option.getOrElse(Option.map(Option.filter(Option.some(value), isSet), (set) => [...set]), () => NO_CHILDREN)
}

function isObjectValue(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

function isMap(value: object): value is Map<unknown, unknown> {
  return value instanceof Map
}

function isSet(value: object): value is Set<unknown> {
  return value instanceof Set
}

export async function transform(
  ast: Ast,
  mutantCollector: MutantCollector,
  transformerContext: Omit<TransformerContext, 'transform'>,
): Promise<readonly string[]> {
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
) => Promise<readonly string[]>

export interface TransformerContext {
  transform: AstTransformer<AstFormat>
  options: TransformerOptions
  mutateDescription: MutateDescription
}

export const transformHtml: AstTransformer<'html'> = async (
  { root },
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  for (const script of root.scripts) {
    warnings.push(...(await context.transform(script, mutantCollector, context)))
  }
  return warnings
}

const moduleScriptStart = '<script context="module">\n'
const moduleScript = `${moduleScriptStart}\n</script>\n`

export const transformSvelte: AstTransformer<'svelte'> = async (
  svelte,
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  const { root } = svelte
  const scripts = [root.moduleScript, ...root.additionalScripts].filter(Predicate.isNotNullish)
  for (const script of scripts) {
    warnings.push(
      ...(await context.transform(script.ast, mutantCollector, {
        ...context,
        options: {
          ...context.options,
          noHeader: true,
        },
      })),
    )
  }

  await placeModuleHeaderIfNeeded(svelte, mutantCollector)
  return warnings
}

async function placeModuleHeaderIfNeeded(
  svelte: AstByFormat['svelte'],
  mutantCollector: MutantCollector,
): Promise<void> {
  if (hasPlacedMutants(mutantCollector, svelte.originFileName)) {
    await placeModuleHeader(svelte)
  }
}

async function placeModuleHeader(svelte: AstByFormat['svelte']): Promise<void> {
  const { root, originFileName } = svelte
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
  await placeHeader(root.moduleScript.ast.root)
}

function emptyProgram(): Program {
  return { type: 'Program', sourceType: 'module', body: [] }
}

interface MutantsPlacement {
  appliedMutants: Map<Mutant, Node>
  placer: MutantPlacer
}

type PlacementMap = Map<Node, MutantsPlacement>

function isMutateRangeList(value: MutateDescription): value is readonly SourceLocationInFile[] {
  return Array.isArray(value)
}

export const transformScript: AstTransformer<ScriptFormat> = async (
  { root, originFileName, rawContent, offset, comments },
  mutantCollector,
  { options, mutateDescription },
  mutators?: typeof allMutators,
  mutantPlacers?: readonly MutantPlacer[],
) => {
  const lineTable = buildLineTable(rawContent)

  attachComments(root, comments as readonly AttachedComment[], lineTable)

  const placementMap: PlacementMap = new Map()

  let directiveRule: Rule = rootRule
  const mutatorEntries = Object.entries(Option.getOrElse(Option.fromNullishOr(mutators), () => allMutators))
  const placers = Option.getOrElse(Option.fromNullishOr(mutantPlacers), () => allMutantPlacers)
  const allMutatorNames = mutatorEntries.map(([name]) => name.toLowerCase())

  const warnings: string[] = []

  traverse(root, {
    enter(path) {
      const result = processStrykerDirectives(directiveRule, path.node, allMutatorNames, originFileName)
      directiveRule = result.rule
      warnings.push(...result.warnings)
      visitNode(path)
    },
    exit(path) {
      const placement = placementMap.get(path.node)
      if (hasAppliedMutants(placement)) {
        applyPlacement(path, placement)
      }
    },
  })

  await placeHeaderIfNeeded(mutantCollector, originFileName, options, root)

  return warnings

  function visitNode(path: TraversePath): void {
    if (shouldSkip(path)) {
      path.skip()
      return
    }
    addToPlacementMapIfPossible(path)
    placeCollectedMutantsIfMutating(path)
  }
  function addToPlacementMapIfPossible(path: TraversePath): void {
    const placer = placers.find((candidate) => candidate.canPlace(path))
    if (placer !== undefined) {
      placementMap.set(path.node, { appliedMutants: new Map(), placer })
    }
  }
  function hasAppliedMutants(placement: MutantsPlacement | undefined): placement is MutantsPlacement {
    return placement !== undefined && placement.appliedMutants.size > 0
  }
  function applyPlacement(path: TraversePath, placement: MutantsPlacement): void {
    try {
      placement.placer.place(path, placement.appliedMutants)
      path.skip()
    } catch (error) {
      throwPlacementError(
        toError(error),
        path,
        placement.placer,
        [...placement.appliedMutants.keys()],
        originFileName,
        lineTable,
      )
    }
  }
  function placeCollectedMutantsIfMutating(path: TraversePath): void {
    if (shouldMutate(path)) {
      placeCollectedMutants(path)
    }
  }
  function placeCollectedMutants(path: TraversePath): void {
    const mutantsToPlace = collectMutants(path)
    if (mutantsToPlace.length === 0) {
      return
    }
    const placementPath = requiredPlacementPath(path, mutantsToPlace)
    const placement = requiredPlacement(placementPath.node)
    mutantsToPlace.forEach((mutant) => {
      placement.appliedMutants.set(mutant, applyMutant(mutant, placementPath.node))
    })
  }
  function requiredPlacementPath(path: TraversePath, mutantsToPlace: readonly Mutant[]): TraversePath {
    return Option.getOrThrowWith(
      Option.fromNullishOr(path.find((ancestor) => placementMap.has(ancestor.node))),
      () => unplacedMutantsError(mutantsToPlace),
    )
  }
  function unplacedMutantsError(mutantsToPlace: readonly Mutant[]): Error {
    return new Error(
      `Mutants cannot be placed. This shouldn't happen! Unplaced mutants: ${JSON.stringify(mutantsToPlace, null, 2)}`,
    )
  }
  function requiredPlacement(node: Node): MutantsPlacement {
    return Option.getOrThrowWith(
      Option.fromNullishOr(placementMap.get(node)),
      () => new Error('Placement not found for node'),
    )
  }
  function shouldSkip(path: TraversePath): boolean {
    return [
      isTypeNode(path),
      isImportDeclaration(path),
      nodeType(path.node) === 'Decorator',
      mutateDescription === false,
      isOutsideMutateRanges(path),
    ].some((skip) => skip)
  }
  function mutateRanges(): Option.Option<readonly SourceLocationInFile[]> {
    return Option.filter(Option.some(mutateDescription), isMutateRangeList)
  }
  function isOutsideMutateRanges(path: TraversePath): boolean {
    return Option.exists(
      mutateRanges(),
      (ranges) => ranges.every((range) => !locationOverlaps(range, getNodeLocation(path.node))),
    )
  }
  function shouldMutate(path: TraversePath): boolean {
    return mutateDescription === true || isInsideMutateRanges(path)
  }
  function isInsideMutateRanges(path: TraversePath): boolean {
    return Option.exists(
      mutateRanges(),
      (ranges) => ranges.some((range) => locationIncluded(range, getNodeLocation(path.node))),
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
  function ignoreMessageFor(path: TraversePath): string | undefined {
    return Option.getOrUndefined(ignorerReason(toIgnorerPath(path)))
  }
  function ignorerReason(view: IgnorerNodePath): Option.Option<string> {
    return options.ignorers.reduce(
      (reason, ignorer) => Option.orElse(reason, () => ignorer.shouldIgnore(view)),
      Option.none<string>(),
    )
  }

  function collectMutants(path: TraversePath): Mutant[] {
    return mutablesFor(path).map((mutable) =>
      collect(mutantCollector, originFileName, path.node, mutable, offset, lineTable)
    )
      .filter((mutant) => mutant.ignoreReason === undefined)
  }

  function mutablesFor(path: TraversePath): readonly Mutable[] {
    const context = toMutatorContext(path)
    const line = getNodeLocation(path.node).start.line
    return mutatorEntries.flatMap(([mutatorName, mutate]) =>
      [...mutate(path.node, context)].map((replacement) => mutableFor(path, mutatorName, replacement, line))
    )
  }

  function mutableFor(path: TraversePath, mutatorName: string, replacement: Node, line: number): Mutable {
    const mutableEntry: Mutable = { replacement, mutatorName }
    const ignoreReason = ignoreReasonFor(path, mutatorName, line)
    if (ignoreReason !== undefined) {
      mutableEntry.ignoreReason = ignoreReason
    }
    return mutableEntry
  }

  function ignoreReasonFor(path: TraversePath, mutatorName: string, line: number): string | undefined {
    return directiveOrExclusion(mutatorName, line) ?? ignoreMessageFor(path)
  }

  function directiveOrExclusion(mutatorName: string, line: number): string | undefined {
    return findIgnoreReason(directiveRule, mutatorName, line) ?? findExcludedMutatorIgnoreReason(mutatorName)
  }

  function findExcludedMutatorIgnoreReason(mutatorName: string): string | undefined {
    if (options.excludedMutations.includes(mutatorName)) {
      return `Ignored because of excluded mutation "${mutatorName}"`
    } else {
      return undefined
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
