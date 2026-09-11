/**
 * Mutator — every mutation operator and its registry.
 */
import { type AST, RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'
import type { Location, Mutant as ApiMutant, Position } from '@systemfsoftware/stryker-js/Mutant'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'
import type {
  ArrayExpression as EstreeArrayExpression,
  ArrowFunctionExpression as EstreeArrowFunctionExpression,
  AssignmentExpression as EstreeAssignmentExpression,
  BinaryExpression as EstreeBinaryExpression,
  BlockStatement as EstreeBlockStatement,
  ClassBody as EstreeClassBody,
  DoWhileStatement as EstreeDoWhileStatement,
  Expression as EstreeExpression,
  ForStatement as EstreeForStatement,
  Identifier as EstreeIdentifier,
  IfStatement as EstreeIfStatement,
  Literal as EstreeLiteral,
  LogicalExpression as EstreeLogicalExpression,
  MemberExpression as EstreeMemberExpression,
  MethodDefinition as EstreeMethodDefinition,
  NewExpression as EstreeNewExpression,
  Node as EstreeNode,
  ObjectExpression as EstreeObjectExpression,
  Property as EstreeProperty,
  PropertyDefinition as EstreePropertyDefinition,
  SimpleCallExpression as EstreeCallExpression,
  SpreadElement as EstreeSpreadElement,
  SwitchCase as EstreeSwitchCase,
  TemplateElement as EstreeTemplateElement,
  TemplateLiteral as EstreeTemplateLiteral,
  UnaryExpression as EstreeUnaryExpression,
  UpdateExpression as EstreeUpdateExpression,
  WhileStatement as EstreeWhileStatement,
} from 'estree'

import {
  arrayExpression,
  arrowFunctionExpression,
  blockStatement,
  booleanLiteral,
  buildLineTable,
  callExpression,
  cloneNode,
  identifier,
  memberExpression,
  newExpression,
  nodeType,
  positionFromLineTable,
  regExpLiteral,
  spanOf,
  stringLiteral,
  templateElement,
  templateLiteral,
  traverse,
  type TraversePath,
  unaryExpression,
  updateExpression,
} from './estree.js'
import { printNode } from './print/index.js'

export type Node = EstreeNode
/**
 * Node identity: same kind, same span. oxc nodes always carry a range
 * (parsed with `range: true`), which is a stronger identity than the old
 * estree line/column loc.
 */
export function eqNode(a: Node, b: Node): boolean {
  const identity = nodeIdentity(a)
  return identity !== undefined && identity === nodeIdentity(b)
}

function nodeIdentity(node: Node): string | undefined {
  const span = spanOf(node)
  if (span === undefined) {
    return undefined
  }
  return `${node.type}:${span.start}:${span.end}`
}

export interface Mutable {
  mutatorName: string
  ignoreReason?: string | undefined
  replacement: Node
}
export interface Mutant extends Mutable {
  readonly id: string
  readonly fileName: string
  readonly original: Node
  readonly offset: Position
  readonly lineTable: readonly number[]
  readonly replacementCode: string
}
function orDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback
}

export function createMutant(
  id: string,
  fileName: string,
  original: Node,
  specs: Mutable,
  offset?: Position,
  lineTable?: readonly number[],
): Mutant {
  return {
    id,
    fileName,
    original,
    offset: orDefault(offset, { column: 0, line: 0 }),
    lineTable: orDefault(lineTable, buildLineTable('')),
    replacement: specs.replacement,
    mutatorName: specs.mutatorName,
    ignoreReason: specs.ignoreReason,
    replacementCode: printNode(specs.replacement),
  }
}
export function toApiMutant(mutant: Mutant): ApiMutant {
  const start = nodeOffset(mutant, 'start')
  const end = nodeOffset(mutant, 'end')
  const baseFields = {
    fileName: mutant.fileName,
    id: mutant.id,
    location: toApiLocation(start, end, mutant.lineTable, mutant.offset),
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacementCode,
  }
  if (mutant.ignoreReason !== undefined) {
    return {
      _tag: 'Mutant',
      ...baseFields,
      statusReason: mutant.ignoreReason,
      status: 'Ignored',
    }
  }
  return { _tag: 'Mutant', ...baseFields }
}

function nodeOffset(mutant: Mutant, edge: 'start' | 'end'): number {
  const span = spanOf(mutant.original)
  if (span === undefined) {
    throw new Error(`Node without a ${edge} offset`)
  }
  return span[edge]
}

export function applyMutant(mutant: Mutant, originalTree: Node): Node {
  if (originalTree === mutant.original) {
    return mutant.replacement
  }
  return cloneWithReplacement(mutant, originalTree)
}

function cloneWithReplacement(mutant: Mutant, originalTree: Node): Node {
  const mutatedAst = cloneNode(originalTree)
  const { original, replacement } = mutant
  if (hasReplaced(mutatedAst, original, replacement) === false) {
    throw new Error(`Could not apply mutant ${JSON.stringify(replacement)}.`)
  }
  return mutatedAst
}

function hasReplaced(root: Node, original: Node, replacement: Node): boolean {
  let applied = false
  traverse(root, {
    enter(path) {
      if (applied) {
        path.stop()
        return
      }
      applied = replaceFirstMatch(path, original, replacement)
    },
  })
  return applied
}

function replaceFirstMatch(path: TraversePath, original: Node, replacement: Node): boolean {
  if (eqNode(path.node, original) === false) {
    return false
  }
  path.replaceWith(replacement)
  return true
}

/**
 * Converts a node span to the API location: offsets become positions via the
 * file's line table, then the AST's own offset shifts them into its document.
 */
function toApiLocation(
  startOffset: number,
  endOffset: number,
  lineTable: readonly number[],
  offset: Position,
): Location {
  return {
    start: toPosition(positionFromLineTable(startOffset, lineTable), offset),
    end: toPosition(positionFromLineTable(endOffset, lineTable), offset),
  }
}
function toPosition(source: Position, offset: Position): Position {
  let columnOffset = 0
  if (source.line === 1) {
    columnOffset = offset.column
  }
  return { column: source.column + columnOffset, line: source.line + offset.line - 1 }
}

export interface MutatorContext {
  readonly parent: Node | undefined
  readonly grandParent: Node | undefined
  readonly ancestors: readonly Node[]
}

/**
 * One mutator: a pure function from a node to the mutants it produces.
 *
 * A function, not an object with a `mutate` method and a `name` field. The name
 * lived inside every mutator AND as its position in a hand-written list, so the
 * two could disagree; the registry's key is now the only place a name is
 * written.
 */
export type Mutator = (node: Node, context: MutatorContext) => Iterable<Node>

export interface MutatorOptions {
  excludedMutations: string[]
  noHeader?: boolean
}

/**
 * The mutations of a regular expression pattern.
 *
 * Pure: a pattern and its flags in, replacement patterns out. No I/O, no clock,
 * no throwing — a pattern this cannot parse yields no mutants, which is the
 * honest answer for a literal whose syntax the engine does not model.
 *
 * The transformation set is fixed and small, and each member changes exactly
 * one thing about the pattern:
 *
 * | family                  | example                  |
 * | ----------------------- | ------------------------ |
 * | anchor removal          | `^abc$` -> `abc$`, `^abc` |
 * | character class negation| `[abc]` <-> `[^abc]`      |
 * | predefined class negation| `\d` <-> `\D`, `\p{L}` <-> `\P{L}` |
 * | quantifier removal      | `a+`, `a*`, `a{2,3}` -> `a` |
 * | lookaround negation     | `(?=a)` <-> `(?!a)`, `(?<=a)` <-> `(?<!a)` |
 *
 * Alternation and grouping are deliberately untouched: swapping a branch or
 * dropping a group produces mutants that survive for reasons unrelated to the
 * test suite's strength, which inflates a score rather than measuring one.
 *
 * The order is part of the contract, because a mutant's identity in a report is
 * its position: anchors first, then each remaining position left to right with
 * quantifier removal ahead of class negation.
 */
export function mutateRegexPattern(pattern: string, flags: string | undefined): readonly string[] {
  if (pattern.length === 0) {
    return []
  }
  return parseRegexMutants(pattern, orDefault(flags, ''))
}

function parseRegexMutants(pattern: string, flags: string): readonly string[] {
  try {
    const groups = collectSplices(pattern, flags)
    groups.rest.sort((a, b) => a.start - b.start || a.priority - b.priority)
    return [...groups.bol, ...groups.eol, ...groups.rest].map((splice) => spliceText(pattern, splice))
  } catch {
    return []
  }
}

interface Splice {
  readonly start: number
  readonly end: number
  readonly text: string
}

interface PrioritizedSplice extends Splice {
  readonly priority: number
}

interface SpliceGroups {
  readonly bol: Splice[]
  readonly eol: Splice[]
  readonly rest: PrioritizedSplice[]
}

function collectSplices(pattern: string, flags: string): SpliceGroups {
  const groups: SpliceGroups = { bol: [], eol: [], rest: [] }
  const parser = new RegExpParser()
  const ast = parser.parsePattern(pattern, undefined, undefined, {
    unicode: flags.includes('u'),
    unicodeSets: flags.includes('v'),
  })
  visitRegExpAST(ast, {
    onAssertionEnter(assertion) {
      collectAssertion(assertion, pattern, groups)
    },
    onCharacterClassEnter(characterClass) {
      collectCharacterClass(characterClass, groups)
    },
    onCharacterSetEnter(characterSet) {
      collectCharacterSet(characterSet, groups)
    },
    onQuantifierEnter(quantifier) {
      collectQuantifier(quantifier, groups)
    },
  })
  return groups
}

function collectAssertion(assertion: AST.Assertion, pattern: string, groups: SpliceGroups): void {
  Match.value(assertion).pipe(
    Match.when(isEdgeAssertion, (edge) => pushAnchor(edge, pattern, groups)),
    Match.when(isLookaround, (lookaround) => groups.rest.push(lookaroundNegation(lookaround))),
    Match.orElse(() => undefined),
  )
}

function isEdgeAssertion(assertion: AST.Assertion): assertion is AST.EdgeAssertion {
  return assertion.kind === 'start' || assertion.kind === 'end'
}

function isLookaround(assertion: AST.Assertion): assertion is AST.LookaroundAssertion {
  return assertion.kind === 'lookahead' || assertion.kind === 'lookbehind'
}

function pushAnchor(edge: AST.EdgeAssertion, pattern: string, groups: SpliceGroups): void {
  pushWhen(anchorGroup(edge, groups), anchorRemoval(edge, pattern))
}

function anchorGroup(edge: AST.EdgeAssertion, groups: SpliceGroups): Splice[] {
  return Match.value(edge.kind).pipe(
    Match.when('start', () => groups.bol),
    Match.orElse(() => groups.eol),
  )
}

function lookaroundNegation(lookaround: AST.LookaroundAssertion): PrioritizedSplice {
  return Match.value(lookaround.kind).pipe(
    Match.when('lookahead', () => lookaroundSplice(lookaround, 2)),
    Match.orElse(() => lookaroundSplice(lookaround, 3)),
  )
}

function lookaroundSplice(lookaround: AST.LookaroundAssertion, markerWidth: number): PrioritizedSplice {
  return {
    start: lookaround.start + markerWidth,
    end: lookaround.start + markerWidth + 1,
    text: negationMarker(lookaround.negate),
    priority: 1,
  }
}

function negationMarker(negate: boolean): string {
  return Match.value(negate).pipe(
    Match.when(true, () => '='),
    Match.orElse(() => '!'),
  )
}

function collectCharacterClass(characterClass: AST.CharacterClass, groups: SpliceGroups): void {
  const pos = characterClass.start + 1
  if (characterClass.negate) {
    groups.rest.push({ start: pos, end: pos + 1, text: '', priority: 1 })
  } else {
    groups.rest.push({ start: pos, end: pos, text: '^', priority: 1 })
  }
}

function collectCharacterSet(characterSet: AST.CharacterSet, groups: SpliceGroups): void {
  pushWhen(groups.rest, characterSetSplice(characterSet))
}

function characterSetSplice(characterSet: AST.CharacterSet): PrioritizedSplice | undefined {
  return Match.value(characterSet.kind).pipe(
    Match.when((kind) => NEGATABLE_CHARACTER_SETS[kind] === true, () => classSplice(characterSet)),
    Match.orElse(() => undefined),
  )
}

const NEGATABLE_CHARACTER_SETS: Readonly<Record<string, true>> = {
  digit: true,
  space: true,
  word: true,
  property: true,
}

const PROPERTY_MARKERS: Readonly<Partial<Record<string, string>>> = { p: 'P', P: 'p' }

function classSplice(characterSet: AST.CharacterSet): PrioritizedSplice {
  const pos = characterSet.start + 1
  return { start: pos, end: pos + 1, text: invertedMarker(orDefault(characterSet.raw[1], '')), priority: 2 }
}

/** `\d`-style sets invert by letter case, `\p{}` by `p`/`P`. */
function invertedMarker(marker: string): string {
  const propertyMarker = PROPERTY_MARKERS[marker]
  if (propertyMarker !== undefined) {
    return propertyMarker
  }
  return invertLetterCase(marker)
}

function invertLetterCase(letter: string): string {
  if (letter === letter.toUpperCase()) {
    return letter.toLowerCase()
  }
  return letter.toUpperCase()
}

function collectQuantifier(quantifier: AST.Quantifier, groups: SpliceGroups): void {
  groups.rest.push({ start: quantifier.start, end: quantifier.end, text: quantifier.element.raw, priority: 0 })
}

function anchorRemoval(assertion: AST.Assertion, pattern: string): Splice | undefined {
  const splice = { start: assertion.start, end: assertion.end, text: '' }
  if (spliceText(pattern, splice).length === 0) {
    return undefined
  }
  return splice
}

function pushWhen<T>(list: T[], splice: T | undefined): void {
  if (splice !== undefined) {
    list.push(splice)
  }
}

function spliceText(pattern: string, splice: Splice): string {
  return pattern.slice(0, splice.start) + splice.text + pattern.slice(splice.end)
}

const NO_MUTANTS: readonly Node[] = []

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/** A copy of the node carrying a different operator. */
function withOperator<T extends Node & { operator: string }>(node: T, operator: T['operator']): T {
  const replacement = cloneNode(node)
  replacement.operator = operator
  return replacement
}

/** The mutants a condition selects, built only when it holds. */
function mutantsWhen(holds: boolean, build: () => readonly Node[]): readonly Node[] {
  return Match.value(holds).pipe(
    Match.when(true, build),
    Match.orElse(() => NO_MUTANTS),
  )
}

/** A named property of a node that may or may not carry it. */
function propertyOf(node: unknown, key: string): unknown {
  return Match.value(node).pipe(
    Match.when(
      (candidate: unknown): candidate is Record<string, unknown> => Predicate.hasProperty(candidate, key),
      (host) => host[key],
    ),
    Match.orElse(() => undefined),
  )
}

function isIdentifier(node: unknown): node is EstreeIdentifier {
  return nodeType(node) === 'Identifier'
}

function isCallExpression(node: Node): node is EstreeCallExpression {
  return node.type === 'CallExpression'
}

const arithmeticOperatorReplacements = Object.freeze(
  {
    '+': '-',
    '-': '+',
    '*': '/',
    '/': '*',
    '%': '*',
  } as const,
)

const ARITHMETIC_OPERATOR_KEYS: readonly string[] = Object.keys(arithmeticOperatorReplacements)

type ArithmeticBinary = EstreeBinaryExpression & { operator: keyof typeof arithmeticOperatorReplacements }

export const arithmeticOperatorMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isArithmeticBinary, (binary) => [withOperator(binary, arithmeticOperatorReplacements[binary.operator])]),
    Match.orElse(() => NO_MUTANTS),
  )

function isArithmeticBinary(node: Node): node is ArithmeticBinary {
  return node.type === 'BinaryExpression' && isSupportedArithmeticOperator(node.operator, node)
}

function isSupportedArithmeticOperator(operator: string, node: EstreeBinaryExpression): boolean {
  return ARITHMETIC_OPERATOR_KEYS.includes(operator) && !isStringConcatenation(node)
}

/** `1 + x` is arithmetic; `"a" + x` concatenates, and there is nothing to mutate. */
function isStringConcatenation(node: EstreeBinaryExpression): boolean {
  return isStringLike(node.right) || isStringLike(outerLeftOperand(node))
}

/** A chained `a + b + c` carries its value on the innermost left operand's right side. */
function outerLeftOperand(node: EstreeBinaryExpression): unknown {
  if (node.left.type === 'BinaryExpression') {
    return node.left.right
  }
  return node.left
}

type ArrayConstructorCall = (EstreeCallExpression | EstreeNewExpression) & {
  callee: EstreeIdentifier & { name: 'Array' }
}

export const arrayDeclarationMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isArrayExpression, (array) => [arrayDeclarationReplacement(array)]),
    Match.when(isArrayConstructorCall, (construct) => [arrayConstructorReplacement(construct)]),
    Match.orElse(() => NO_MUTANTS),
  )

function isArrayExpression(node: Node): node is EstreeArrayExpression {
  return node.type === 'ArrayExpression'
}

function arrayDeclarationReplacement(array: EstreeArrayExpression): EstreeExpression {
  if (array.elements.length > 0) {
    return arrayExpression()
  }
  return arrayExpression([stringLiteral('Stryker was here')])
}

function isArrayConstructorCall(node: Node): node is ArrayConstructorCall {
  return isCallOrNewExpression(node) && isArrayIdentifier(node.callee)
}

function isCallOrNewExpression(node: Node): node is EstreeCallExpression | EstreeNewExpression {
  return node.type === 'CallExpression' || node.type === 'NewExpression'
}

function isArrayIdentifier(node: Node): node is EstreeIdentifier & { name: 'Array' } {
  return node.type === 'Identifier' && node.name === 'Array'
}

function arrayConstructorReplacement(construct: ArrayConstructorCall): EstreeExpression {
  const mutatedCallArgs = constructorArguments(construct.arguments)
  if (construct.type === 'NewExpression') {
    return newExpression(cloneNode(construct.callee), mutatedCallArgs)
  }
  return callExpression(cloneNode(construct.callee), mutatedCallArgs)
}

function constructorArguments(args: ReadonlyArray<EstreeExpression | EstreeSpreadElement>): EstreeExpression[] {
  if (args.length > 0) {
    return []
  }
  return [arrayExpression()]
}

export const arrowFunctionMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isExpressionBodiedArrow, () => [arrowFunctionExpression([], identifier('undefined'))]),
    Match.orElse(() => NO_MUTANTS),
  )

function isExpressionBodiedArrow(node: Node): node is EstreeArrowFunctionExpression {
  return node.type === 'ArrowFunctionExpression' && hasMutableArrowBody(node.body)
}

function hasMutableArrowBody(body: EstreeBlockStatement | EstreeExpression): boolean {
  return body.type !== 'BlockStatement' && !isUndefinedExpression(body)
}

function isUndefinedExpression(node: EstreeBlockStatement | EstreeExpression): node is EstreeIdentifier {
  return node.type === 'Identifier' && node.name === 'undefined'
}

const assignmentOperatorReplacements = Object.freeze(
  {
    '+=': '-=',
    '-=': '+=',
    '*=': '/=',
    '/=': '*=',
    '%=': '*=',
    '<<=': '>>=',
    '>>=': '<<=',
    '&=': '|=',
    '|=': '&=',
    '&&=': '||=',
    '||=': '&&=',
    '??=': '&&=',
  } as const,
)

// estree merges string literals into `Literal` (numbers, booleans and regex
// share the tag), so the string check inspects the value, not the tag.
function isStringLike(value: unknown): value is EstreeTemplateLiteral | StringLiteral {
  return isTemplateLiteral(value) || isStringLiteral(value)
}

function isTemplateLiteral(value: unknown): value is EstreeTemplateLiteral {
  return nodeType(value) === 'TemplateLiteral'
}

type StringLiteral = EstreeLiteral & { value: string }

function isStringLiteral(value: unknown): value is StringLiteral {
  return nodeType(value) === 'Literal' && hasStringValue(value)
}

function hasStringValue(value: unknown): boolean {
  if (!Predicate.hasProperty(value, 'value')) {
    return false
  }
  return typeof value['value'] === 'string'
}

const stringAssignmentTypes = Object.freeze(['&&=', '||=', '??='])

const ASSIGNMENT_OPERATOR_KEYS: readonly string[] = Object.keys(assignmentOperatorReplacements)

type AssignmentBinary = EstreeAssignmentExpression & { operator: keyof typeof assignmentOperatorReplacements }

export const assignmentOperatorMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isMutatableAssignment, (assignment) => [
      withOperator(assignment, assignmentOperatorReplacements[assignment.operator]),
    ]),
    Match.orElse(() => NO_MUTANTS),
  )

function isMutatableAssignment(node: Node): node is AssignmentBinary {
  return node.type === 'AssignmentExpression' && isSupportedAssignment(node)
}

function isSupportedAssignment(node: EstreeAssignmentExpression): boolean {
  return ASSIGNMENT_OPERATOR_KEYS.includes(node.operator) && isSupportedAssignmentExpression(node)
}

function isSupportedAssignmentExpression(node: EstreeAssignmentExpression): boolean {
  return !isStringLike(node.right) || stringAssignmentTypes.includes(node.operator)
}

export const blockStatementMutator: Mutator = (node, context) =>
  mutantsWhen(isMutableBlock(node, context), () => [blockStatement([])])

function isMutableBlock(node: Node, context: MutatorContext): boolean {
  return node.type === 'BlockStatement' && isValid(node, context)
}

function isValid(node: EstreeBlockStatement, context: MutatorContext): boolean {
  return !isEmpty(node) && !isInvalidConstructorBody(node, context)
}

function isEmpty(node: EstreeBlockStatement): boolean {
  return node.body.length === 0
}

function isInvalidConstructorBody(block: EstreeBlockStatement, context: MutatorContext): boolean {
  const parent = context.parent
  // estree: the constructor is a MethodDefinition whose `value` is the function
  return isConstructorMethod(parent) && constructorBodyMatters(block, parent, context)
}

function isConstructorMethod(node: Node | undefined): node is EstreeMethodDefinition {
  return isMethodDefinition(node) && node.kind === 'constructor'
}

function isMethodDefinition(node: Node | undefined): node is EstreeMethodDefinition {
  return node?.type === 'MethodDefinition'
}

function constructorBodyMatters(
  block: EstreeBlockStatement,
  constructor: EstreeMethodDefinition,
  context: MutatorContext,
): boolean {
  return containsSuperCall(block) && hasConstructorInitialization(constructor, context)
}

/** A derived constructor's body is load-bearing: it runs `super()` and seeds parameter properties. */
function hasConstructorInitialization(constructor: EstreeMethodDefinition, context: MutatorContext): boolean {
  return [constructor.value.params.some(isParameterProperty), hasInitializedProperties(context)].some(Boolean)
}

type ParameterProperty = { readonly type: 'TSParameterProperty' }

function isParameterProperty(param: unknown): param is ParameterProperty {
  return nodeType(param) === 'TSParameterProperty'
}

function hasInitializedProperties(context: MutatorContext): boolean {
  const classBody = context.grandParent
  return isClassBody(classBody) && classBody.body.some(isInitializedField)
}

function isClassBody(node: Node | undefined): node is EstreeClassBody {
  return node?.type === 'ClassBody'
}

function isInitializedField(member: Node): boolean {
  return isPropertyDefinition(member) && isPresent(member.value)
}

function isPropertyDefinition(node: Node): node is EstreePropertyDefinition {
  return node.type === 'PropertyDefinition'
}

function isSuperType(node: unknown): boolean {
  return Predicate.hasProperty(node, 'type') && node['type'] === 'Super'
}

function isSuperCallExpression(node: unknown): boolean {
  return nodeType(node) === 'CallExpression' && isSuperType(propertyOf(node, 'callee'))
}

function containsSuperCall(node: unknown): boolean {
  return isObjectLike(node) && containsSuperIn(node)
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function containsSuperIn(node: object): boolean {
  return isSuperReference(node) || hasSuperInChildren(node)
}

function isSuperReference(node: unknown): boolean {
  return isSuperType(node) || isSuperCallExpression(node)
}

function hasSuperInChildren(node: object): boolean {
  return Object.keys(node).some((key) => containsSuperInValue(propertyOf(node, key)))
}

function containsSuperInValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSuperCall)
  }
  return containsSuperCall(value)
}

type BooleanLiteral = EstreeLiteral & { value: boolean }

export const booleanLiteralMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isBooleanLiteral, (literal) => [booleanLiteral(!literal.value)]),
    Match.when(isNegatedPrefix, (unary) => [cloneNode(unary.argument)]),
    Match.orElse(() => NO_MUTANTS),
  )

function isBooleanLiteral(node: Node): node is BooleanLiteral {
  return node.type === 'Literal' && typeof node.value === 'boolean'
}

function isNegatedPrefix(node: Node): node is EstreeUnaryExpression {
  return isUnaryExpression(node) && isNegation(node)
}

function isUnaryExpression(node: Node): node is EstreeUnaryExpression {
  return node.type === 'UnaryExpression'
}

type NegatedPrefix = EstreeUnaryExpression & { operator: '!' }

function isNegation(unary: EstreeUnaryExpression): unary is NegatedPrefix {
  return unary.operator === '!' && unary.prefix
}

const booleanOperators = Object.freeze(['!=', '!==', '&&', '<', '<=', '==', '===', '>', '>=', '||'])

export const conditionalExpressionMutator: Mutator = (node, context) =>
  Match.value(isTestOfLoop(node, context)).pipe(
    Match.when(true, () => [booleanLiteral(false)]),
    Match.orElse(() => conditionTestMutants(node, context)),
  )

function conditionTestMutants(node: Node, context: MutatorContext): readonly Node[] {
  return Match.value(isTestOfCondition(node, context)).pipe(
    Match.when(true, () => [booleanLiteral(true), booleanLiteral(false)]),
    Match.orElse(() => booleanExpressionMutants(node, context)),
  )
}

function booleanExpressionMutants(node: Node, context: MutatorContext): readonly Node[] {
  return Match.value(isBooleanExpression(node)).pipe(
    Match.when(true, () => booleanExpressionReplacements(context)),
    Match.orElse(() => statementMutants(node)),
  )
}

function statementMutants(node: Node): readonly Node[] {
  return Match.value(node).pipe(
    Match.when(isEmptyTestForStatement, (loop) => [withEmptyTest(loop)]),
    Match.when(isNonEmptySwitchCase, (switchCase) => [withEmptyConsequent(switchCase)]),
    Match.orElse(() => NO_MUTANTS),
  )
}

function withEmptyTest(loop: EstreeForStatement): EstreeForStatement {
  const replacement = cloneNode(loop)
  replacement.test = booleanLiteral(false)
  return replacement
}

function withEmptyConsequent(switchCase: EstreeSwitchCase): EstreeSwitchCase {
  const replacement = cloneNode(switchCase)
  replacement.consequent = []
  return replacement
}

function isEmptyTestForStatement(node: Node): node is EstreeForStatement {
  return node.type === 'ForStatement' && node.test === null
}

function isNonEmptySwitchCase(node: Node): node is EstreeSwitchCase {
  return node.type === 'SwitchCase' && node.consequent.length > 0
}

/** A `true` test only matters in `a && b` and a `false` one in `a || b`; any other parent takes both. */
function booleanExpressionReplacements(context: MutatorContext): readonly Node[] {
  return Match.value(logicalParentOperator(context.parent)).pipe(
    Match.when('&&', () => [booleanLiteral(true)]),
    Match.when('||', () => [booleanLiteral(false)]),
    Match.orElse(() => [booleanLiteral(true), booleanLiteral(false)]),
  )
}

function logicalParentOperator(parent: Node | undefined): string | undefined {
  return Match.value(parent).pipe(
    Match.when(isLogicalExpression, (logical) => logical.operator),
    Match.orElse(() => undefined),
  )
}

function isLogicalExpression(node: Node | undefined): node is EstreeLogicalExpression {
  return node?.type === 'LogicalExpression'
}

function isTestOfLoop(node: Node, context: MutatorContext): boolean {
  return isLoopStatement(context.parent) && testOfStatement(context.parent) === node
}

function isTestOfCondition(node: Node, context: MutatorContext): boolean {
  return isIfStatement(context.parent) && testOfStatement(context.parent) === node
}

function isLoopStatement(node: Node | undefined): boolean {
  return isTestBearingStatement(node) && LOOP_STATEMENT_KINDS[node.type] === true
}

function isIfStatement(node: Node | undefined): node is EstreeIfStatement {
  return node?.type === 'IfStatement'
}

const LOOP_STATEMENT_KINDS: Readonly<Record<string, true>> = {
  ForStatement: true,
  WhileStatement: true,
  DoWhileStatement: true,
}

const TEST_BEARING_KINDS: Readonly<Record<string, true>> = {
  IfStatement: true,
  WhileStatement: true,
  DoWhileStatement: true,
  ForStatement: true,
}

type TestBearingStatement = EstreeIfStatement | EstreeWhileStatement | EstreeDoWhileStatement | EstreeForStatement

function isTestBearingStatement(node: Node | undefined): node is TestBearingStatement {
  return node !== undefined && TEST_BEARING_KINDS[node.type] === true
}

function testOfStatement(node: Node | undefined): Node | undefined {
  return Match.value(node).pipe(
    Match.when(isTestBearingStatement, (statement) => statement.test ?? undefined),
    Match.orElse(() => undefined),
  )
}

function isBooleanExpression(node: Node): node is EstreeBinaryExpression | EstreeLogicalExpression {
  return isOperatorExpression(node) && booleanOperators.includes(node.operator)
}

function isOperatorExpression(node: Node): node is EstreeBinaryExpression | EstreeLogicalExpression {
  return node.type === 'BinaryExpression' || node.type === 'LogicalExpression'
}

const operators = {
  '<': ['<=', '>='],
  '<=': ['<', '>'],
  '>': ['>=', '<='],
  '>=': ['>', '<'],
  '==': ['!='],
  '!=': ['=='],
  '===': ['!=='],
  '!==': ['==='],
} as const

const EQUALITY_OPERATOR_KEYS: readonly string[] = Object.keys(operators)

type EqualityBinary = EstreeBinaryExpression & { operator: keyof typeof operators }

export const equalityOperatorMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isEqualityBinary, (binary) => mutatedEqualityOperators(binary)),
    Match.orElse(() => NO_MUTANTS),
  )

function isEqualityBinary(node: Node): node is EqualityBinary {
  return node.type === 'BinaryExpression' && EQUALITY_OPERATOR_KEYS.includes(node.operator)
}

function mutatedEqualityOperators(binary: EqualityBinary): readonly Node[] {
  return operators[binary.operator].map((operator) => withOperator(binary, operator))
}

const logicalOperatorReplacements = Object.freeze(
  {
    '&&': '||',
    '||': '&&',
    '??': '&&',
  } as const,
)

const LOGICAL_OPERATOR_KEYS: readonly string[] = Object.keys(logicalOperatorReplacements)

type LogicalBinary = EstreeLogicalExpression & { operator: keyof typeof logicalOperatorReplacements }

export const logicalOperatorMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isSupportedLogicalOperator, (binary) => [
      withOperator(binary, logicalOperatorReplacements[binary.operator]),
    ]),
    Match.orElse(() => NO_MUTANTS),
  )

function isSupportedLogicalOperator(node: Node): node is LogicalBinary {
  return node.type === 'LogicalExpression' && LOGICAL_OPERATOR_KEYS.includes(node.operator)
}

const baseReplacements: Record<string, string | null> = {
  charAt: null,
  endsWith: 'startsWith',
  every: 'some',
  filter: null,
  reverse: null,
  slice: null,
  sort: null,
  substr: null,
  substring: null,
  toLocaleLowerCase: 'toLocaleUpperCase',
  toLowerCase: 'toUpperCase',
  trim: null,
  trimEnd: 'trimStart',
  min: 'max',
  setDate: 'setTime',
  setFullYear: 'setMonth',
  setHours: 'setMinutes',
  setSeconds: 'setMilliseconds',
  setUTCDate: 'setTime',
  setUTCFullYear: 'setUTCMonth',
  setUTCHours: 'setUTCMinutes',
  setUTCSeconds: 'setUTCMilliseconds',
}

const noReverseReplacements = ['getUTCDate', 'setUTCDate']

const replacements = new Map<string, string | null>(Object.entries(baseReplacements))
for (const [key, value] of Object.entries(baseReplacements)) {
  if (value !== null && !noReverseReplacements.includes(key)) {
    replacements.set(value, key)
  }
}

interface NamedMember extends EstreeMemberExpression {
  readonly property: EstreeIdentifier
  readonly object: EstreeExpression
}

interface MethodMutation {
  readonly call: EstreeCallExpression
  readonly callee: NamedMember
  readonly newName: string | null
}

export const methodExpressionMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isCallExpression, (call) => methodCallMutants(call)),
    Match.orElse(() => NO_MUTANTS),
  )

function methodCallMutants(call: EstreeCallExpression): readonly Node[] {
  return Match.value(methodMutation(call)).pipe(
    Match.when(isMethodMutation, (mutation) => [methodExpressionReplacement(mutation)]),
    Match.orElse(() => NO_MUTANTS),
  )
}

function isMethodMutation(mutation: MethodMutation | undefined): mutation is MethodMutation {
  return mutation !== undefined
}

/** The method this call replaces, or `undefined` when the call is not one this operator knows. */
function methodMutation(call: EstreeCallExpression): MethodMutation | undefined {
  const callee = namedMethodCallee(call)
  return Match.value(callee).pipe(
    Match.when(undefined, () => undefined),
    Match.orElse((member) => mutationFor(call, member)),
  )
}

function mutationFor(call: EstreeCallExpression, callee: NamedMember): MethodMutation | undefined {
  return Match.value(replacements.get(callee.property.name)).pipe(
    Match.when(undefined, () => undefined),
    Match.orElse((newName) => ({ call, callee, newName })),
  )
}

function namedMethodCallee(call: EstreeCallExpression): NamedMember | undefined {
  return Match.value(call.callee).pipe(
    Match.when(isNamedMember, (member) => member),
    Match.orElse(() => undefined),
  )
}

function isNamedMember(node: unknown): node is NamedMember {
  return isMemberProperty(node) && isNotSuperMember(node)
}

function isMemberProperty(node: unknown): node is NamedMember {
  return nodeType(node) === 'MemberExpression' && isIdentifier(propertyOf(node, 'property'))
}

function isNotSuperMember(member: NamedMember): boolean {
  return !isSuperType(member.object)
}

function methodExpressionReplacement(mutation: MethodMutation): EstreeExpression {
  return Match.value(mutation.newName).pipe(
    Match.when(null, () => callExpression(cloneNode(mutation.callee.object), [], mutation.callee.optional === true)),
    Match.orElse((newName) => renamedMethodCall(mutation, newName)),
  )
}

function renamedMethodCall(mutation: MethodMutation, newName: string): EstreeExpression {
  const mutatedCallee = memberExpression(
    cloneNode(mutation.callee.object),
    identifier(newName),
    false,
    mutation.callee.optional === true,
  )
  return callExpression(mutatedCallee, spreadFreeArguments(mutation.call.arguments), mutation.call.optional === true)
}

function spreadFreeArguments(args: ReadonlyArray<EstreeExpression | EstreeSpreadElement>): EstreeExpression[] {
  return args.filter(isNotSpreadElement).map((argument) => cloneNode(argument))
}

function isNotSpreadElement(node: EstreeExpression | EstreeSpreadElement): node is EstreeExpression {
  return node.type !== 'SpreadElement'
}

export const objectLiteralMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isNonEmptyObjectLiteral, (): readonly Node[] => [{ type: 'ObjectExpression', properties: [] }]),
    Match.orElse(() => NO_MUTANTS),
  )

function isNonEmptyObjectLiteral(node: Node): node is EstreeObjectExpression {
  return node.type === 'ObjectExpression' && node.properties.length > 0
}

export const optionalChainingMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isOptionalMember, (member) => [withoutOptional(member)]),
    Match.when(isOptionalCall, (call) => [withoutOptional(call)]),
    Match.orElse(() => NO_MUTANTS),
  )

function isOptionalMember(node: Node): node is EstreeMemberExpression {
  return node.type === 'MemberExpression' && node.optional === true
}

function isOptionalCall(node: Node): node is EstreeCallExpression {
  return node.type === 'CallExpression' && node.optional === true
}

function withoutOptional<T extends Node & { optional?: boolean }>(node: T): T {
  const replacement = cloneNode(node)
  replacement.optional = false
  return replacement
}

type RegexLiteral = EstreeLiteral & { regex: { pattern: string; flags: string } }

export const regexMutator: Mutator = (node, context) =>
  Match.value(node).pipe(
    Match.when(isRegexLiteral, (literal) => regexLiteralMutants(literal)),
    Match.when(isStringLiteral, (literal) =>
      mutantsWhen(isObviousRegexString(literal, context), () => regexConstructorMutants(literal, context))),
    Match.orElse(() =>
      NO_MUTANTS
    ),
  )

function isRegexLiteral(node: Node): node is RegexLiteral {
  return nodeType(node) === 'Literal' && isPresent(propertyOf(node, 'regex'))
}

function regexLiteralMutants(literal: RegexLiteral): readonly Node[] {
  return mutateRegexPattern(literal.regex.pattern, literal.regex.flags).map((pattern) =>
    regExpLiteral(pattern, literal.regex.flags)
  )
}

function regexConstructorMutants(literal: StringLiteral, context: MutatorContext): readonly Node[] {
  return mutateRegexPattern(literal.value, regexFlags(context.parent)).map((pattern) => stringLiteral(pattern))
}

/** A string passed as the first argument of `new RegExp(...)`. */
function isObviousRegexString(node: Node, context: MutatorContext): boolean {
  return isRegExpConstructor(context.parent) && newExpressionArgument(context.parent, 0) === node
}

function isRegExpConstructor(parent: Node | undefined): boolean {
  return isNewExpression(parent) && isRegExpIdentifier(parent.callee)
}

function isNewExpression(node: Node | undefined): node is EstreeNewExpression {
  return node?.type === 'NewExpression'
}

function isRegExpIdentifier(node: Node): boolean {
  return node.type === 'Identifier' && node.name === RegExp.name
}

function newExpressionArgument(parent: Node | undefined, index: number): unknown {
  return Match.value(parent).pipe(
    Match.when(isNewExpression, (call) => call.arguments[index]),
    Match.orElse(() => undefined),
  )
}

function regexFlags(parent: Node | undefined): string | undefined {
  return Match.value(newExpressionArgument(parent, 1)).pipe(
    Match.when(isStringLiteral, (literal) => literal.value),
    Match.orElse(() => undefined),
  )
}

const PLACEHOLDER = 'Stryker was here!'

export const stringLiteralMutator: Mutator = (node, context) =>
  Match.value(node).pipe(
    Match.when(isTemplateLiteral, (template) => templateMutants(template)),
    Match.when(isStringLiteral, (literal) =>
      mutantsWhen(isValidParent(literal, context), () => [
        stringLiteral(replacementText(literal.value.length === 0)),
      ])),
    Match.orElse(() => NO_MUTANTS),
  )

function templateMutants(template: EstreeTemplateLiteral): readonly Node[] {
  return Match.value(template.quasis[0]).pipe(
    Match.when(undefined, () => NO_MUTANTS),
    Match.orElse((first) => [emptyOrPlaceholderTemplate(template, first)]),
  )
}

function emptyOrPlaceholderTemplate(template: EstreeTemplateLiteral, first: EstreeTemplateElement): Node {
  const isEmptyTemplate = [template.quasis.length === 1, first.value.raw.length === 0].every(Boolean)
  return templateLiteral([templateElement(replacementText(isEmptyTemplate))], [])
}

function replacementText(isEmpty: boolean): string {
  if (isEmpty) {
    return PLACEHOLDER
  }
  return ''
}

function isValidParent(child: Node, context: MutatorContext): boolean {
  const parent = context.parent
  return parent === undefined || !isDisallowedParent(parent, child)
}

function isDisallowedParent(parent: Node, child: Node): boolean {
  return [
    isImportExportRelated(parent),
    isJsxOrExpressionRelated(parent),
    isObjectOrClassPropertyKey(parent, child),
    isDisallowedCallExpression(parent),
  ].some(Boolean)
}

const MODULE_KINDS: Readonly<Record<string, true>> = {
  ImportDeclaration: true,
  ExportNamedDeclaration: true,
  ExportDefaultDeclaration: true,
  ExportAllDeclaration: true,
  TSExternalModuleReference: true,
}

function isImportExportRelated(parent: Node): boolean {
  return MODULE_KINDS[parent.type] === true
}

const JSX_KINDS: Readonly<Record<string, true>> = {
  JSXAttribute: true,
  ExpressionStatement: true,
  TSLiteralType: true,
}

function isJsxOrExpressionRelated(parent: Node): boolean {
  return JSX_KINDS[parent.type] === true || isObjectMethod(parent)
}

function isObjectMethod(node: Node): node is EstreeProperty {
  return node.type === 'Property' && node.method === true
}

function isObjectOrClassPropertyKey(parent: Node, child: Node): boolean {
  return isPropertyHost(parent) && isKeyOf(parent, child)
}

function isPropertyHost(node: Node): node is EstreeProperty | EstreePropertyDefinition {
  return node.type === 'Property' || node.type === 'PropertyDefinition'
}

function isKeyOf(host: EstreeProperty | EstreePropertyDefinition, child: Node): boolean {
  return nodeType(host.key) !== undefined && host.key === child
}

const DISALLOWED_CALLEES: Readonly<Record<string, true>> = { require: true, Symbol: true, import: true }

function isDisallowedCallExpression(parent: Node): boolean {
  return isCallExpression(parent) && DISALLOWED_CALLEES[calleeName(parent)] === true
}

function calleeName(parent: EstreeCallExpression): string {
  return Match.value(parent.callee).pipe(
    Match.when(isIdentifier, (identifier) => identifier.name),
    Match.when(isImportCallee, () => 'import'),
    Match.orElse(() => ''),
  )
}

type ImportCallee = { readonly type: 'Import' }

function isImportCallee(callee: unknown): callee is ImportCallee {
  return nodeType(callee) === 'Import'
}

const UnaryOperator = {
  '+': '-',
  '-': '+',
  '~': '',
} as const

const UNARY_OPERATOR_KEYS: readonly string[] = Object.keys(UnaryOperator)

type SupportedUnaryExpression = EstreeUnaryExpression & { operator: keyof typeof UnaryOperator }

export const unaryOperatorMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isSupportedUnaryExpression, (unary) => [unaryOperatorReplacement(unary)]),
    Match.orElse(() => NO_MUTANTS),
  )

function isSupportedUnaryExpression(node: Node): node is SupportedUnaryExpression {
  return isPrefixUnaryExpression(node) && isSupportedUnaryOperator(node.operator)
}

function isPrefixUnaryExpression(node: Node): node is EstreeUnaryExpression {
  return node.type === 'UnaryExpression' && node.prefix
}

/** The sign-flipping unary becomes a flipped unary; `~x` loses its operator entirely. */
function unaryOperatorReplacement(unary: SupportedUnaryExpression): EstreeExpression {
  const mutatedOperator = UnaryOperator[unary.operator]
  return Match.value(mutatedOperator).pipe(
    Match.when(isPlusOrMinus, (operator) => unaryExpression(operator, cloneNode(unary.argument))),
    Match.orElse(() => cloneNode(unary.argument)),
  )
}

function isSupportedUnaryOperator(operator: string): operator is keyof typeof UnaryOperator {
  return UNARY_OPERATOR_KEYS.includes(operator)
}

function isPlusOrMinus(operator: string): operator is '-' | '+' {
  return operator === '-' || operator === '+'
}

const UpdateOperators = {
  '++': '--',
  '--': '++',
} as const

export const updateOperatorMutator: Mutator = (node) =>
  Match.value(node).pipe(
    Match.when(isUpdateExpression, (update) => [
      updateExpression(UpdateOperators[update.operator], cloneNode(update.argument), update.prefix),
    ]),
    Match.orElse(() => NO_MUTANTS),
  )

function isUpdateExpression(node: Node): node is EstreeUpdateExpression {
  return node.type === 'UpdateExpression'
}

/**
 * Every mutator this instrumenter can apply, named explicitly.
 *
 * This list is deliberately hand-written rather than self-registering. A
 * registry populated by import side effects — each mutator module calling
 * `registerMutator(self)` at module scope — makes the mutant population depend
 * on which imports were evaluated: import order decides the order, a bundler
 * that judges a side-effect-only import unused drops a mutator entirely, and
 * anything reading the array before the last import finished sees a short list.
 * Every one of those failures REMOVES mutants, which RAISES the mutation score,
 * so the tool reports a better number for doing less work and nothing anywhere
 * says so.
 *
 * Naming each mutator here costs one line when a mutator is added and makes
 * that line a compile-checked import instead of a runtime effect.
 */
export const allMutators: Readonly<Record<string, Mutator>> = Object.freeze({
  ArithmeticOperator: arithmeticOperatorMutator,
  ArrayDeclaration: arrayDeclarationMutator,
  ArrowFunction: arrowFunctionMutator,
  AssignmentOperator: assignmentOperatorMutator,
  BlockStatement: blockStatementMutator,
  BooleanLiteral: booleanLiteralMutator,
  ConditionalExpression: conditionalExpressionMutator,
  EqualityOperator: equalityOperatorMutator,
  LogicalOperator: logicalOperatorMutator,
  MethodExpression: methodExpressionMutator,
  ObjectLiteral: objectLiteralMutator,
  OptionalChaining: optionalChainingMutator,
  Regex: regexMutator,
  StringLiteral: stringLiteralMutator,
  UnaryOperator: unaryOperatorMutator,
  UpdateOperator: updateOperatorMutator,
})
