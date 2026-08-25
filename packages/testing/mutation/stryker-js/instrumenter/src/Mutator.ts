/**
 * Mutator — every mutation operator and its registry.
 */
import babel, { type types } from '@babel/core'
import generator from '@babel/generator'
import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'
import { type Location, Mutant as ApiMutant, type Position } from '@systemfsoftware/stryker-js/Mutant'
import * as Predicate from 'effect/Predicate'

const { traverse: babelTraverse, types: babelTypes } = babel
const t = babelTypes
type GeneratorFn = (ast: unknown, opts?: unknown, code?: unknown) => { code: string }
function isGeneratorFn(value: unknown): value is GeneratorFn {
  return typeof value === 'function'
}
function hasDefault(value: unknown): value is { default: GeneratorFn } {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('default' in value)) {
    return false
  }
  const def = Reflect.get(value, 'default')
  return typeof def === 'function'
}
let generateExport: GeneratorFn
const candidate: unknown = generator
if (isGeneratorFn(candidate)) {
  generateExport = candidate
} else if (hasDefault(candidate)) {
  generateExport = candidate.default
} else {
  throw new Error('Missing generator')
}
const generate = generateExport

export function deepCloneNode<TNode extends babel.types.Node>(node: TNode): TNode {
  return babelTypes.cloneNode(node, true, false)
}

function eqPosition(a: Position, b: Position): boolean {
  return a.line === b.line && a.column === b.column
}
function eqLocation(a: types.SourceLocation, b: types.SourceLocation): boolean {
  return eqPosition(a.start, b.start) && eqPosition(a.end, b.end)
}
export function eqNode<T extends types.Node>(a: T, b: types.Node): b is T {
  return a.type === b.type && !!a.loc && !!b.loc && eqLocation(a.loc, b.loc)
}

export interface Mutable {
  mutatorName: string
  ignoreReason?: string | undefined
  replacement: types.Node
}
export interface Mutant extends Mutable {
  readonly id: string
  readonly fileName: string
  readonly original: types.Node
  readonly offset: Position
  readonly replacementCode: string
}
export function createMutant(
  id: string,
  fileName: string,
  original: types.Node,
  specs: Mutable,
  offset: Position = { column: 0, line: 0 },
): Mutant {
  return {
    id,
    fileName,
    original,
    offset,
    replacement: specs.replacement,
    mutatorName: specs.mutatorName,
    ignoreReason: specs.ignoreReason,
    replacementCode: generate(specs.replacement, { sourceMaps: false }).code,
  }
}
export function toApiMutant(mutant: Mutant): ApiMutant {
  const loc = mutant.original.loc
  if (loc === undefined || loc === null) {
    throw new Error('Babel node without a source location')
  }
  const baseFields = {
    fileName: mutant.fileName,
    id: mutant.id,
    location: toApiLocation(loc, mutant.offset),
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
export function applyMutant(mutant: Mutant, originalTree: types.Node): types.Node {
  if (originalTree === mutant.original) {
    return mutant.replacement
  }
  const mutatedAst = deepCloneNode(originalTree)
  const { original, replacement } = mutant
  const didApply = hasReplaced(mutatedAst, original, replacement)
  if (didApply === false) {
    throw new Error(`Could not apply mutant ${JSON.stringify(replacement)}.`)
  }
  return mutatedAst
}
function hasReplaced(root: types.Node, original: types.Node, replacement: types.Node): boolean {
  let applied = false
  babelTraverse(root, {
    noScope: true,
    enter(path) {
      if (eqNode(path.node, original)) {
        path.replaceWith(replacement)
        path.stop()
        applied = true
      }
    },
  })
  return applied
}
function toApiLocation(source: types.SourceLocation, offset: Position): Location {
  return { start: toPosition(source.start, offset), end: toPosition(source.end, offset) }
}
function toPosition(source: Position, offset: Position): Position {
  let columnOffset = 0
  if (source.line === 1) {
    columnOffset = offset.column
  }
  return { column: source.column + columnOffset, line: source.line + offset.line - 1 }
}

export interface MutatorContext {
  readonly parent: types.Node | undefined
  readonly grandParent: types.Node | undefined
  readonly ancestors: readonly types.Node[]
}

/**
 * One mutator: a pure function from a node to the mutants it produces.
 *
 * A function, not an object with a `mutate` method and a `name` field. The name
 * lived inside every mutator AND as its position in a hand-written list, so the
 * two could disagree; the registry's key is now the only place a name is
 * written.
 */
export type Mutator = (node: types.Node, context: MutatorContext) => Iterable<types.Node>

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
  if (t.isBinaryExpression(node) && isSupportedArithmeticOperator(node.operator, node)) {
    const mutatedOperator = arithmeticOperatorReplacements[node.operator]
    const replacement = deepCloneNode(node)
    replacement.operator = mutatedOperator
    yield replacement
  }
}

function isSupportedArithmeticOperator(
  operator: string,
  node: types.BinaryExpression,
): operator is keyof typeof arithmeticOperatorReplacements {
  if (!Object.keys(arithmeticOperatorReplacements).includes(operator)) {
    return false
  }

  const stringTypes = ['StringLiteral', 'TemplateLiteral']
  let leftType: string
  if (t.isBinaryExpression(node.left)) {
    leftType = node.left.right.type
  } else {
    leftType = node.left.type
  }

  if (stringTypes.includes(node.right.type) || stringTypes.includes(leftType)) {
    return false
  }

  return true
}

export const arrayDeclarationMutator: Mutator = function*(node, _context: MutatorContext) {
  if (babelTypes.isArrayExpression(node)) {
    let replacement: types.ArrayExpression
    if (node.elements.length > 0) {
      replacement = babelTypes.arrayExpression()
    } else {
      replacement = babelTypes.arrayExpression([babelTypes.stringLiteral('Stryker was here')])
    }
    yield replacement
  }
  if (
    (babelTypes.isCallExpression(node) || babelTypes.isNewExpression(node)) &&
    babelTypes.isIdentifier(node.callee) &&
    node.callee.name === 'Array'
  ) {
    let mutatedCallArgs: types.Expression[]
    if (node.arguments.length > 0) {
      mutatedCallArgs = []
    } else {
      mutatedCallArgs = [babelTypes.arrayExpression()]
    }
    let replacement: types.CallExpression | types.NewExpression
    if (babelTypes.isNewExpression(node)) {
      replacement = babelTypes.newExpression(deepCloneNode(node.callee), mutatedCallArgs)
    } else {
      replacement = babelTypes.callExpression(deepCloneNode(node.callee), mutatedCallArgs)
    }
    yield replacement
  }
}

export const arrowFunctionMutator: Mutator = function*(node, _context: MutatorContext) {
  if (
    babelTypes.isArrowFunctionExpression(node) &&
    !babelTypes.isBlockStatement(node.body) &&
    !(babelTypes.isIdentifier(node.body) && node.body.name === 'undefined')
  ) {
    yield babelTypes.arrowFunctionExpression([], babelTypes.identifier('undefined'))
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

const stringTypes = Object.freeze(['StringLiteral', 'TemplateLiteral'])
const stringAssignmentTypes = Object.freeze(['&&=', '||=', '??='])

export const assignmentOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (
    babelTypes.isAssignmentExpression(node) && isSupportedAssignmentOperator(node.operator) &&
    isSupportedAssignmentExpression(node)
  ) {
    const mutatedOperator = assignmentOperatorReplacements[node.operator]
    const replacement = deepCloneNode(node)
    replacement.operator = mutatedOperator
    yield replacement
  }
}

function isSupportedAssignmentOperator(operator: string): operator is keyof typeof assignmentOperatorReplacements {
  return Object.keys(assignmentOperatorReplacements).includes(operator)
}

function isSupportedAssignmentExpression(node: types.AssignmentExpression): boolean {
  if (stringTypes.includes(node.right.type) && !stringAssignmentTypes.includes(node.operator)) {
    return false
  }

  return true
}

export const blockStatementMutator: Mutator = function*(node, context: MutatorContext) {
  if (babelTypes.isBlockStatement(node) && isValid(node, context)) {
    yield babelTypes.blockStatement([])
  }
}

function isValid(node: babel.types.BlockStatement, context: MutatorContext): boolean {
  return !isEmpty(node) && !isInvalidConstructorBody(node, context)
}

function isEmpty(node: babel.types.BlockStatement): boolean {
  return node.body.length === 0
}

function isInvalidConstructorBody(node: babel.types.BlockStatement, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined || !babelTypes.isClassMethod(parent) || parent.kind !== 'constructor') {
    return false
  }
  const hasParamProps = parent.params.some((param) => babelTypes.isTSParameterProperty(param))
  const hasInitProps = containsInitializedClassProperties(parent, context)
  const hasSuper = hasSuperExpression(node)
  return (hasParamProps || hasInitProps) && hasSuper
}

function containsInitializedClassProperties(constructor: babel.types.ClassMethod, context: MutatorContext): boolean {
  const grandParent = context.grandParent
  if (grandParent === undefined || !babelTypes.isClassBody(grandParent)) {
    return false
  }
  return grandParent.body.some((classMember) =>
    babelTypes.isClassProperty(classMember) && classMember.value !== null && classMember.value !== undefined
  )
}

function hasSuperExpression(block: babel.types.BlockStatement): boolean {
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
  if (babelTypes.isBooleanLiteral(node)) {
    yield babelTypes.booleanLiteral(!node.value)
  }
  if (babelTypes.isUnaryExpression(node) && node.operator === '!' && node.prefix) {
    yield deepCloneNode(node.argument)
  }
}

const booleanOperators = Object.freeze(['!=', '!==', '&&', '<', '<=', '==', '===', '>', '>=', '||'])

export const conditionalExpressionMutator: Mutator = function*(node, context: MutatorContext) {
  if (isTestOfLoop(node, context)) {
    yield babelTypes.booleanLiteral(false)
  } else if (isTestOfCondition(node, context)) {
    yield babelTypes.booleanLiteral(true)
    yield babelTypes.booleanLiteral(false)
  } else if (isBooleanExpression(node)) {
    const parent = context.parent
    if (parent !== undefined && babelTypes.isLogicalExpression(parent)) {
      if (parent.operator === '||') {
        yield babelTypes.booleanLiteral(false)
        return
      }
      if (parent.operator === '&&') {
        yield babelTypes.booleanLiteral(true)
        return
      }
    }
    yield babelTypes.booleanLiteral(true)
    yield babelTypes.booleanLiteral(false)
  } else if (babelTypes.isForStatement(node) && node.test === null) {
    const replacement = deepCloneNode(node)
    replacement.test = babelTypes.booleanLiteral(false)
    yield replacement
  } else if (babelTypes.isSwitchCase(node) && node.consequent.length > 0) {
    const replacement = deepCloneNode(node)
    replacement.consequent = []
    yield replacement
  }
}

function isTestOfLoop(node: babel.types.Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return false
  }
  if (babelTypes.isForStatement(parent) && parent.test === node) {
    return true
  }
  if (babelTypes.isWhileStatement(parent) && parent.test === node) {
    return true
  }
  if (babelTypes.isDoWhileStatement(parent) && parent.test === node) {
    return true
  }
  return false
}

function isTestOfCondition(node: babel.types.Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return false
  }
  return babelTypes.isIfStatement(parent) && parent.test === node
}

function isBooleanExpression(node: babel.types.Node): boolean {
  if (babelTypes.isBinaryExpression(node)) {
    return booleanOperators.includes(node.operator)
  }
  if (babelTypes.isLogicalExpression(node)) {
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
  if (t.isBinaryExpression(node) && isEqualityOperator(node.operator)) {
    for (const mutableOperator of operators[node.operator]) {
      const replacement = t.cloneNode(node, true)
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
  if (babelTypes.isLogicalExpression(node) && isSupportedLogicalOperator(node.operator)) {
    const mutatedOperator = logicalOperatorReplacements[node.operator]
    const replacement = deepCloneNode(node)
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

const replacements: Record<string, string | null> = { ...baseReplacements }
for (const key of Object.keys(baseReplacements)) {
  const value = baseReplacements[key]
  if (value !== null && value !== undefined && !noReverseReplacements.includes(key)) {
    replacements[value] = key
  }
}

export const methodExpressionMutator: Mutator = function*(node, _context: MutatorContext) {
  if (!(babelTypes.isCallExpression(node) || babelTypes.isOptionalCallExpression(node))) {
    return
  }

  const { callee } = node
  if (
    !(babelTypes.isMemberExpression(callee) || babelTypes.isOptionalMemberExpression(callee)) ||
    !babelTypes.isIdentifier(callee.property)
  ) {
    return
  }

  const newName = replacements[callee.property.name]
  if (newName === undefined) {
    return
  }

  if (newName === null) {
    yield deepCloneNode(callee.object)
    return
  }

  const nodeArguments = node.arguments.map((argumentNode) => deepCloneNode(argumentNode))

  let mutatedCallee: types.MemberExpression | types.OptionalMemberExpression
  if (babelTypes.isMemberExpression(callee)) {
    mutatedCallee = babelTypes.memberExpression(
      deepCloneNode(callee.object),
      babelTypes.identifier(newName),
      false,
      callee.optional,
    )
  } else {
    mutatedCallee = babelTypes.optionalMemberExpression(
      deepCloneNode(callee.object),
      babelTypes.identifier(newName),
      false,
      callee.optional,
    )
  }

  if (babelTypes.isCallExpression(node)) {
    yield babelTypes.callExpression(mutatedCallee, nodeArguments)
  } else {
    yield babelTypes.optionalCallExpression(mutatedCallee, nodeArguments, node.optional)
  }
}

export const objectLiteralMutator: Mutator = function*(node, _context: MutatorContext) {
  if (babelTypes.isObjectExpression(node) && node.properties.length > 0) {
    yield babelTypes.objectExpression([])
  }
}

export const optionalChainingMutator: Mutator = function*(node, _context: MutatorContext) {
  if (t.isOptionalMemberExpression(node) && node.optional) {
    yield t.optionalMemberExpression(
      t.cloneNode(node.object, true),
      t.cloneNode(node.property, true),
      node.computed,
      false,
    )
  }
  if (t.isOptionalCallExpression(node) && node.optional) {
    yield t.optionalCallExpression(
      t.cloneNode(node.callee, true),
      node.arguments.map((arg) => t.cloneNode(arg, true)),
      false,
    )
  }
}

export const regexMutator: Mutator = function*(node, context: MutatorContext) {
  if (babelTypes.isRegExpLiteral(node)) {
    for (const replacementPattern of mutateRegexPattern(node.pattern, node.flags)) {
      yield babelTypes.regExpLiteral(replacementPattern, node.flags)
    }
  } else if (babelTypes.isStringLiteral(node) && isObviousRegexString(node, context)) {
    const parent = context.parent
    if (parent !== undefined && babelTypes.isNewExpression(parent)) {
      const flags = getFlags(parent)
      for (const replacementPattern of mutateRegexPattern(node.value, flags)) {
        yield babelTypes.stringLiteral(replacementPattern)
      }
    }
  }
}

function isObviousRegexString(node: babel.types.StringLiteral, context: MutatorContext): boolean {
  const parent = context.parent
  if (
    parent === undefined || !babelTypes.isNewExpression(parent) || !babelTypes.isIdentifier(parent.callee) ||
    parent.callee.name !== RegExp.name
  ) {
    return false
  }
  return parent.arguments[0] === node
}

function getFlags(node: babel.types.NewExpression): string | undefined {
  const secondArg = node.arguments[1]
  if (secondArg !== undefined && babelTypes.isStringLiteral(secondArg)) {
    return secondArg.value
  }
  return undefined
}

export const stringLiteralMutator: Mutator = function*(node, context: MutatorContext) {
  if (babelTypes.isTemplateLiteral(node)) {
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
    yield babelTypes.templateLiteral([babelTypes.templateElement({ raw: replacement })], [])
  }
  if (babelTypes.isStringLiteral(node) && isValidParent(node, context)) {
    let replacement: string
    if (node.value.length === 0) {
      replacement = 'Stryker was here!'
    } else {
      replacement = ''
    }
    yield babelTypes.stringLiteral(replacement)
  }
}

function isValidParent(child: babel.types.StringLiteral, context: MutatorContext): boolean {
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

function isImportExportRelated(parent: babel.types.Node): boolean {
  return (
    babelTypes.isImportDeclaration(parent) ||
    babelTypes.isExportDeclaration(parent) ||
    babelTypes.isImportOrExportDeclaration(parent) ||
    babelTypes.isTSExternalModuleReference(parent)
  )
}

function isJsxOrExpressionRelated(parent: babel.types.Node): boolean {
  return (
    babelTypes.isJSXAttribute(parent) ||
    babelTypes.isExpressionStatement(parent) ||
    babelTypes.isTSLiteralType(parent) ||
    babelTypes.isObjectMethod(parent)
  )
}

function isObjectOrClassPropertyKey(parent: babel.types.Node, child: babel.types.StringLiteral): boolean {
  return (babelTypes.isObjectProperty(parent) && parent.key === child) ||
    (babelTypes.isClassProperty(parent) && parent.key === child)
}

function isDisallowedCallExpression(parent: babel.types.Node): boolean {
  return isRequireCall(parent) || isSymbolCall(parent) || isImportCall(parent)
}

function isRequireCall(parent: babel.types.Node): boolean {
  return babelTypes.isCallExpression(parent) && babelTypes.isIdentifier(parent.callee, { name: 'require' })
}

function isSymbolCall(parent: babel.types.Node): boolean {
  return babelTypes.isCallExpression(parent) && babelTypes.isIdentifier(parent.callee, { name: 'Symbol' })
}

function isImportCall(parent: babel.types.Node): boolean {
  return babelTypes.isCallExpression(parent) && babelTypes.isImport(parent.callee)
}

const UnaryOperator = {
  '+': '-',
  '-': '+',
  '~': '',
} as const

export const unaryOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (babelTypes.isUnaryExpression(node) && isSupportedUnaryOperator(node.operator) && node.prefix) {
    const mutatedOperator = UnaryOperator[node.operator]
    let replacement: types.Node
    if (isPlusOrMinus(mutatedOperator)) {
      replacement = babelTypes.unaryExpression(mutatedOperator, deepCloneNode(node.argument))
    } else {
      replacement = deepCloneNode(node.argument)
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
  if (babelTypes.isUpdateExpression(node)) {
    yield babelTypes.updateExpression(UpdateOperators[node.operator], deepCloneNode(node.argument), node.prefix)
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
