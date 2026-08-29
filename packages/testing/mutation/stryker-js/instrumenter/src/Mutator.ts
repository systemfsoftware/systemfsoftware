/**
 * Mutator — every mutation operator and its registry.
 */
import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'
import { type Location, Mutant as ApiMutant, type Position } from '@systemfsoftware/stryker-js/Mutant'
import * as Predicate from 'effect/Predicate'
import type {
  AssignmentExpression as EstreeAssignmentExpression,
  BinaryExpression as EstreeBinaryExpression,
  BlockStatement as EstreeBlockStatement,
  Expression as EstreeExpression,
  NewExpression as EstreeNewExpression,
  Node as EstreeNode,
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
  const spanA = spanOf(a)
  const spanB = spanOf(b)
  return (
    a.type === b.type &&
    spanA !== undefined && spanB !== undefined &&
    spanA.start === spanB.start && spanA.end === spanB.end
  )
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
export function createMutant(
  id: string,
  fileName: string,
  original: Node,
  specs: Mutable,
  offset: Position = { column: 0, line: 0 },
  lineTable: readonly number[] = buildLineTable(''),
): Mutant {
  return {
    id,
    fileName,
    original,
    offset,
    lineTable,
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
    return ApiMutant.make({
      ...baseFields,
      statusReason: mutant.ignoreReason,
      status: 'Ignored' as const,
    })
  }
  return ApiMutant.make(baseFields)
}

function nodeOffset(mutant: Mutant, edge: 'start' | 'end'): number {
  const span = spanOf(mutant.original)
  const value = span?.[edge]
  if (typeof value !== 'number') {
    throw new Error(`Node without a ${edge} offset`)
  }
  return value
}

export function applyMutant(mutant: Mutant, originalTree: Node): Node {
  if (originalTree === mutant.original) {
    return mutant.replacement
  }
  const mutatedAst = cloneNode(originalTree)
  const { original, replacement } = mutant
  const didApply = hasReplaced(mutatedAst, original, replacement)
  if (didApply === false) {
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
      if (eqNode(path.node, original)) {
        path.replaceWith(replacement)
        applied = true
        path.stop()
      }
    },
  })
  return applied
}

/**
 * Converts a node span to the API location: offsets become positions via the
 * file's line table, then the embedding-document offset (html/svelte) applies.
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
  try {
    const f = flags ?? ''
    const parser = new RegExpParser()
    const ast = parser.parsePattern(pattern, undefined, undefined, {
      unicode: f.includes('u'),
      unicodeSets: f.includes('v'),
    })
    const bol: Array<{ start: number; end: number; text: string }> = []
    const eol: Array<{ start: number; end: number; text: string }> = []
    const rest: Array<{ start: number; end: number; text: string; priority: number }> = []

    visitRegExpAST(ast, {
      onAssertionEnter(node) {
        if (node.kind === 'start') {
          const splice = { start: node.start, end: node.end, text: '' }
          const mutated = pattern.slice(0, splice.start) + splice.text + pattern.slice(splice.end)
          if (mutated.length === 0) {
            return
          }
          bol.push(splice)
        } else if (node.kind === 'end') {
          const splice = { start: node.start, end: node.end, text: '' }
          const mutated = pattern.slice(0, splice.start) + splice.text + pattern.slice(splice.end)
          if (mutated.length === 0) {
            return
          }
          eol.push(splice)
        } else if (node.kind === 'lookahead' || node.kind === 'lookbehind') {
          let offset: number
          if (node.kind === 'lookahead') {
            offset = 2
          } else {
            offset = 3
          }
          const pos = node.start + offset
          let text: string
          if (node.negate) {
            text = '='
          } else {
            text = '!'
          }
          rest.push({ start: pos, end: pos + 1, text, priority: 1 })
        }
      },
      onCharacterClassEnter(node) {
        const pos = node.start + 1
        if (node.negate) {
          rest.push({ start: pos, end: pos + 1, text: '', priority: 1 })
        } else {
          rest.push({ start: pos, end: pos, text: '^', priority: 1 })
        }
      },
      onCharacterSetEnter(node) {
        if (node.kind === 'digit' || node.kind === 'space' || node.kind === 'word') {
          const pos = node.start + 1
          const cur = node.raw[1] ?? ''
          let toggled: string
          if (cur === cur.toUpperCase()) {
            toggled = cur.toLowerCase()
          } else {
            toggled = cur.toUpperCase()
          }
          rest.push({ start: pos, end: pos + 1, text: toggled, priority: 2 })
        } else if (node.kind === 'property') {
          const pos = node.start + 1
          const cur = node.raw[1] ?? ''
          let toggled: string
          if (cur === 'p') {
            toggled = 'P'
          } else {
            toggled = 'p'
          }
          rest.push({ start: pos, end: pos + 1, text: toggled, priority: 2 })
        }
      },
      onQuantifierEnter(node) {
        rest.push({ start: node.start, end: node.end, text: node.element.raw, priority: 0 })
      },
    })

    rest.sort((a, b) => a.start - b.start || a.priority - b.priority)
    const all = [...bol, ...eol, ...rest]
    return all.map((s) => pattern.slice(0, s.start) + s.text + pattern.slice(s.end))
  } catch {
    return []
  }
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

export const arithmeticOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'BinaryExpression' && isSupportedArithmeticOperator(node.operator, node)) {
    const mutatedOperator = arithmeticOperatorReplacements[node.operator]
    const replacement = cloneNode(node)
    replacement.operator = mutatedOperator
    yield replacement
  }
}

function isSupportedArithmeticOperator(
  operator: string,
  node: EstreeBinaryExpression,
): operator is keyof typeof arithmeticOperatorReplacements {
  if (!Object.keys(arithmeticOperatorReplacements).includes(operator)) {
    return false
  }

  let leftOperand: unknown = node.left
  if (node.left.type === 'BinaryExpression') {
    leftOperand = node.left.right
  }

  if (isStringLike(node.right) || isStringLike(leftOperand)) {
    return false
  }

  return true
}

export const arrayDeclarationMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'ArrayExpression') {
    let replacement: EstreeExpression
    if (node.elements.length > 0) {
      replacement = arrayExpression()
    } else {
      replacement = arrayExpression([stringLiteral('Stryker was here')])
    }
    yield replacement
  }
  if (
    (node.type === 'CallExpression' || node.type === 'NewExpression') &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Array'
  ) {
    let mutatedCallArgs: EstreeExpression[]
    if (node.arguments.length > 0) {
      mutatedCallArgs = []
    } else {
      mutatedCallArgs = [arrayExpression()]
    }
    let replacement: EstreeExpression
    if (node.type === 'NewExpression') {
      replacement = newExpression(cloneNode(node.callee), mutatedCallArgs)
    } else {
      replacement = callExpression(cloneNode(node.callee), mutatedCallArgs)
    }
    yield replacement
  }
}

export const arrowFunctionMutator: Mutator = function*(node, _context: MutatorContext) {
  if (
    node.type === 'ArrowFunctionExpression' &&
    node.body.type !== 'BlockStatement' &&
    !(node.body.type === 'Identifier' && node.body.name === 'undefined')
  ) {
    yield arrowFunctionExpression([], identifier('undefined'))
  }
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
function isStringLike(node: unknown): boolean {
  if (node === null || node === undefined) return false
  if (nodeType(node) === 'TemplateLiteral') return true
  return nodeType(node) === 'Literal' && typeof (node as { value?: unknown }).value === 'string'
}

const stringAssignmentTypes = Object.freeze(['&&=', '||=', '??='])

export const assignmentOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (
    node.type === 'AssignmentExpression' && isSupportedAssignmentOperator(node.operator) &&
    isSupportedAssignmentExpression(node)
  ) {
    const mutatedOperator = assignmentOperatorReplacements[node.operator]
    const replacement = cloneNode(node)
    replacement.operator = mutatedOperator
    yield replacement
  }
}

function isSupportedAssignmentOperator(operator: string): operator is keyof typeof assignmentOperatorReplacements {
  return Object.keys(assignmentOperatorReplacements).includes(operator)
}
function isSupportedAssignmentExpression(node: EstreeAssignmentExpression): boolean {
  if (isStringLike(node.right) && !stringAssignmentTypes.includes(node.operator)) {
    return false
  }

  return true
}

export const blockStatementMutator: Mutator = function*(node, context: MutatorContext) {
  if (node.type === 'BlockStatement' && isValid(node, context)) {
    yield blockStatement([])
  }
}

function isValid(node: EstreeBlockStatement, context: MutatorContext): boolean {
  return !isEmpty(node) && !isInvalidConstructorBody(node, context)
}

function isEmpty(node: EstreeBlockStatement): boolean {
  return node.body.length === 0
}

function isInvalidConstructorBody(node: EstreeBlockStatement, context: MutatorContext): boolean {
  const parent = context.parent
  // estree: the constructor is a MethodDefinition whose `value` is the function
  if (parent === undefined || parent.type !== 'MethodDefinition' || parent.kind !== 'constructor') {
    return false
  }
  const fn = parent.value
  const hasParamProps = fn.params.some((param) => param !== null && nodeType(param) === 'TSParameterProperty')
  const hasInitProps = containsInitializedClassProperties(parent, context)
  const hasSuper = hasSuperExpression(node)
  return (hasParamProps || hasInitProps) && hasSuper
}

function containsInitializedClassProperties(constructor: Node, context: MutatorContext): boolean {
  const grandParent = context.grandParent
  if (grandParent === undefined || grandParent.type !== 'ClassBody') {
    return false
  }
  return grandParent.body.some((classMember) =>
    classMember.type === 'PropertyDefinition' && classMember.value !== null && classMember.value !== undefined
  )
}

function hasSuperExpression(block: EstreeBlockStatement): boolean {
  return containsSuperCall(block)
}

function isSuperType(node: unknown): boolean {
  return Predicate.hasProperty(node, 'type') && node['type'] === 'Super'
}

function isSuperCallExpression(node: unknown): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'CallExpression' &&
    Predicate.hasProperty(node, 'callee') &&
    isSuperType(node['callee'])
  )
}

function containsSuperCall(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) {
    return false
  }
  if (isSuperType(node) || isSuperCallExpression(node)) {
    return true
  }
  return hasSuperInChildren(node)
}

function hasSuperInChildren(node: object): boolean {
  for (const key of Object.keys(node)) {
    if (!Predicate.hasProperty(node, key)) {
      continue
    }
    const value = node[key]
    if (Array.isArray(value)) {
      for (const element of value) {
        if (containsSuperCall(element)) {
          return true
        }
      }
    } else if (typeof value === 'object' && value !== null && containsSuperCall(value)) {
      return true
    }
  }
  return false
}

export const booleanLiteralMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'Literal' && typeof node.value === 'boolean') {
    yield booleanLiteral(!node.value)
  }
  if (node.type === 'UnaryExpression' && node.operator === '!' && node.prefix) {
    yield cloneNode(node.argument)
  }
}

const booleanOperators = Object.freeze(['!=', '!==', '&&', '<', '<=', '==', '===', '>', '>=', '||'])

export const conditionalExpressionMutator: Mutator = function*(node, context: MutatorContext) {
  if (isTestOfLoop(node, context)) {
    yield booleanLiteral(false)
  } else if (isTestOfCondition(node, context)) {
    yield booleanLiteral(true)
    yield booleanLiteral(false)
  } else if (isBooleanExpression(node)) {
    const parent = context.parent
    if (parent !== undefined && parent.type === 'LogicalExpression') {
      if (parent.operator === '||') {
        yield booleanLiteral(false)
        return
      }
      if (parent.operator === '&&') {
        yield booleanLiteral(true)
        return
      }
    }
    yield booleanLiteral(true)
    yield booleanLiteral(false)
  } else if (node.type === 'ForStatement' && node.test === null) {
    const replacement = cloneNode(node)
    if (replacement.type === 'ForStatement') {
      replacement.test = booleanLiteral(false)
    }
    yield replacement
  } else if (node.type === 'SwitchCase' && node.consequent.length > 0) {
    const replacement = cloneNode(node)
    if (replacement.type === 'SwitchCase') {
      replacement.consequent = []
    }
    yield replacement
  }
}

function isTestOfLoop(node: Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return false
  }
  if (parent.type === 'ForStatement' && parent.test === node) {
    return true
  }
  if (parent.type === 'WhileStatement' && parent.test === node) {
    return true
  }
  if (parent.type === 'DoWhileStatement' && parent.test === node) {
    return true
  }
  return false
}

function isTestOfCondition(node: Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return false
  }
  return parent.type === 'IfStatement' && parent.test === node
}

function isBooleanExpression(node: Node): boolean {
  if (node.type === 'BinaryExpression') {
    return booleanOperators.includes(node.operator)
  }
  if (node.type === 'LogicalExpression') {
    return booleanOperators.includes(node.operator)
  }
  return false
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

function isEqualityOperator(operator: string): operator is keyof typeof operators {
  return Object.keys(operators).includes(operator)
}

export const equalityOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'BinaryExpression' && isEqualityOperator(node.operator)) {
    for (const mutableOperator of operators[node.operator]) {
      const replacement = cloneNode(node)
      replacement.operator = mutableOperator
      yield replacement
    }
  }
}

const logicalOperatorReplacements = Object.freeze(
  {
    '&&': '||',
    '||': '&&',
    '??': '&&',
  } as const,
)

export const logicalOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'LogicalExpression' && isSupportedLogicalOperator(node.operator)) {
    const mutatedOperator = logicalOperatorReplacements[node.operator]
    const replacement = cloneNode(node)
    replacement.operator = mutatedOperator
    yield replacement
  }
}

function isSupportedLogicalOperator(operator: string): operator is keyof typeof logicalOperatorReplacements {
  return Object.keys(logicalOperatorReplacements).includes(operator)
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

export const methodExpressionMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type !== 'CallExpression') {
    return
  }

  const { callee } = node
  // estree: optional chaining is MemberExpression{optional:true}; the property
  // must be a non-computed identifier for this mutator to apply. Optional
  // members stay in the population: `a?.b()` mutates to `a?.()` / `a?.c()`,
  // matching the upstream method-expression coverage.
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') {
    return
  }

  const newName = replacements.get(callee.property.name)
  if (newName === undefined) {
    return
  }

  if (callee.object.type === 'Super') {
    return
  }

  if (newName === null) {
    yield callExpression(cloneNode(callee.object), [], callee.optional === true)
    return
  }

  const nodeArguments: EstreeExpression[] = []
  for (const argumentNode of node.arguments) {
    if (argumentNode.type !== 'SpreadElement') {
      nodeArguments.push(cloneNode(argumentNode))
    }
  }

  const mutatedCallee = memberExpression(
    cloneNode(callee.object),
    identifier(newName),
    false,
    callee.optional === true,
  )

  yield callExpression(mutatedCallee, nodeArguments, node.optional === true)
}

export const objectLiteralMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'ObjectExpression' && node.properties.length > 0) {
    // estree builders here own the empty-object shape
    yield { type: 'ObjectExpression', properties: [] }
  }
}

export const optionalChainingMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'MemberExpression' && node.optional) {
    const replacement = cloneNode(node)
    replacement.optional = false
    yield replacement
  }
  if (node.type === 'CallExpression' && node.optional) {
    const replacement = cloneNode(node)
    replacement.optional = false
    yield replacement
  }
}

export const regexMutator: Mutator = function*(node, context: MutatorContext) {
  if (nodeType(node) === 'Literal' && 'regex' in node && node.regex !== null && node.regex !== undefined) {
    for (const replacementPattern of mutateRegexPattern(node.regex.pattern, node.regex.flags)) {
      yield regExpLiteral(replacementPattern, node.regex.flags)
    }
  } else if (
    nodeType(node) === 'Literal' && 'value' in node && typeof node.value === 'string' &&
    isObviousRegexString(node, context)
  ) {
    const parent = context.parent
    if (parent !== undefined && parent.type === 'NewExpression') {
      const flags = getFlags(parent)
      for (const replacementPattern of mutateRegexPattern(node.value, flags)) {
        yield stringLiteral(replacementPattern)
      }
    }
  }
}

function isObviousRegexString(node: Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (
    parent === undefined || parent.type !== 'NewExpression' || parent.callee.type !== 'Identifier' ||
    parent.callee.name !== RegExp.name
  ) {
    return false
  }
  return parent.arguments[0] === node
}

function getFlags(node: EstreeNewExpression): string | undefined {
  const secondArg = node.arguments[1]
  if (secondArg !== undefined && secondArg.type === 'Literal' && typeof secondArg.value === 'string') {
    return secondArg.value
  }
  return undefined
}

export const stringLiteralMutator: Mutator = function*(node, context: MutatorContext) {
  if (node.type === 'TemplateLiteral') {
    const firstQuasi = node.quasis[0]
    if (firstQuasi === undefined) {
      return
    }
    let replacement: string
    if (node.quasis.length === 1 && firstQuasi.value.raw.length === 0) {
      replacement = 'Stryker was here!'
    } else {
      replacement = ''
    }
    yield templateLiteral([templateElement(replacement)], [])
  }
  if (
    nodeType(node) === 'Literal' && 'value' in node && typeof node.value === 'string' && isValidParent(node, context)
  ) {
    let replacement: string
    if (node.value.length === 0) {
      replacement = 'Stryker was here!'
    } else {
      replacement = ''
    }
    yield stringLiteral(replacement)
  }
}
function isValidParent(child: Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return true
  }
  return (
    !isImportExportRelated(parent) &&
    !isJsxOrExpressionRelated(parent) &&
    !isObjectOrClassPropertyKey(parent, child) &&
    !isDisallowedCallExpression(parent)
  )
}

function isImportExportRelated(parent: Node): boolean {
  return (
    nodeType(parent) === 'ImportDeclaration' ||
    nodeType(parent) === 'ExportNamedDeclaration' ||
    nodeType(parent) === 'ExportDefaultDeclaration' ||
    nodeType(parent) === 'ExportAllDeclaration' ||
    nodeType(parent) === 'TSExternalModuleReference'
  )
}

function isJsxOrExpressionRelated(parent: Node): boolean {
  return (
    nodeType(parent) === 'JSXAttribute' ||
    nodeType(parent) === 'ExpressionStatement' ||
    nodeType(parent) === 'TSLiteralType' ||
    // estree: an object method is a Property whose `method` flag is set
    (parent.type === 'Property' && parent.method === true)
  )
}

function isObjectOrClassPropertyKey(parent: Node, child: Node): boolean {
  return ((parent.type === 'Property' || parent.type === 'PropertyDefinition') && nodeType(parent.key) !== undefined &&
    parent.key === child)
}

function isDisallowedCallExpression(parent: Node): boolean {
  return isRequireCall(parent) || isSymbolCall(parent) || isImportCall(parent)
}

function isRequireCall(parent: Node): boolean {
  return parent.type === 'CallExpression' && nodeType(parent.callee) === 'Identifier' && 'name' in parent.callee &&
    parent.callee.name === 'require'
}

function isSymbolCall(parent: Node): boolean {
  return parent.type === 'CallExpression' && nodeType(parent.callee) === 'Identifier' && 'name' in parent.callee &&
    parent.callee.name === 'Symbol'
}

function isImportCall(parent: Node): boolean {
  return parent.type === 'CallExpression' && nodeType(parent.callee) === 'Import'
}

const UnaryOperator = {
  '+': '-',
  '-': '+',
  '~': '',
} as const

export const unaryOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'UnaryExpression' && isSupportedUnaryOperator(node.operator) && node.prefix) {
    const mutatedOperator = UnaryOperator[node.operator]
    let replacement: EstreeExpression
    if (isPlusOrMinus(mutatedOperator)) {
      replacement = unaryExpression(mutatedOperator, cloneNode(node.argument))
    } else {
      replacement = cloneNode(node.argument)
    }
    yield replacement
  }
}

function isSupportedUnaryOperator(operator: string): operator is keyof typeof UnaryOperator {
  return Object.keys(UnaryOperator).includes(operator)
}

function isPlusOrMinus(operator: string): operator is '-' | '+' {
  return operator === '-' || operator === '+'
}

const UpdateOperators = {
  '++': '--',
  '--': '++',
} as const

export const updateOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (node.type === 'UpdateExpression') {
    yield updateExpression(UpdateOperators[node.operator], cloneNode(node.argument), node.prefix)
  }
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
