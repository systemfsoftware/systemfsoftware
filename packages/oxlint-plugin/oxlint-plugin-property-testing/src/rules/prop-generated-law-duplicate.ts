import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Provenance } from './prop-arbitrary-schema-origin.js'
import { isPropCallee } from './prop-call.js'
import { ACTUAL, EXPECTED, FIX, meta, VIOLATION_NAME } from './prop-generated-law-duplicate.config.js'

export type MessageIds = 'generatedLawDuplicate'

/**
 * Codec-law vocabulary: every call whose terminal name lands here exercises the
 * schema's own encode/decode surface, so a predicate made only of these names —
 * and asserting acceptance, never rejection — re-asserts a generated law.
 */
const CODEC_LAW_CALLEES: Record<string, true> = {
  encode: true,
  encodeSync: true,
  encodeExit: true,
  encodeUnknownSync: true,
  encodeUnknownExit: true,
  decode: true,
  decodeSync: true,
  decodeExit: true,
  decodeUnknownSync: true,
  decodeUnknownExit: true,
  decodeOption: true,
  decodeEither: true,
  decodePromise: true,
  isSuccess: true,
  toEquivalence: true,
  toEncoded: true,
  Exit: true,
}

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

type PredicateShape = {
  leavesVocabulary: boolean
  lastReturnAssertsRejection: boolean
  lastReturnAssertsAcceptance: boolean
}

const ACCEPTANCE_CALLEES: Record<string, true> = { isSuccess: true, isRight: true }
const REJECTION_CALLEES: Record<string, true> = { isFailure: true, isLeft: true }

const mentionsImportMetaVitest = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some((item) => mentionsImportMetaVitest(item))
  if (!isNode(value)) return false
  if (
    value.type === 'MemberExpression' &&
    value.property.type === 'Identifier' &&
    value.property.name === 'vitest' &&
    value.object.type === 'MetaProperty' &&
    value.object.meta.name === 'import' &&
    value.object.property.name === 'meta'
  ) {
    return true
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    if (mentionsImportMetaVitest(child)) return true
  }
  return false
}

const collectPredicateShape = (provenance: Provenance, node: unknown, shape: PredicateShape): void => {
  if (Array.isArray(node)) {
    for (const item of node) collectPredicateShape(provenance, item, shape)
    return
  }
  if (!isNode(node)) return
  if (node.type === 'CallExpression') {
    let callee: ESTree.CallExpression['callee'] = node.callee
    while (callee.type === 'CallExpression') callee = callee.callee
    const codecName = callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
      ? callee.property.name
      : callee.type === 'Identifier'
      ? callee.name
      : null
    if (codecName === null) {
      shape.leavesVocabulary = true
    } else if (
      CODEC_LAW_CALLEES[codecName] !== true &&
      REJECTION_CALLEES[codecName] !== true &&
      ACCEPTANCE_CALLEES[codecName] !== true
    ) {
      if (provenance.verdictOf(callee, 0) !== 'schema') shape.leavesVocabulary = true
    }
  }
  if (node.type === 'ReturnStatement' && node.argument !== null && node.argument !== undefined) {
    const outcome = returnOutcome(provenance, node.argument)
    shape.lastReturnAssertsRejection = outcome === 'rejection'
    shape.lastReturnAssertsAcceptance = outcome === 'acceptance'
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue
    collectPredicateShape(provenance, child, shape)
  }
}

const returnOutcome = (provenance: Provenance, expression: ESTree.Node): 'acceptance' | 'rejection' | 'other' => {
  if (expression.type === 'BinaryExpression') return returnOutcome(provenance, expression.left)
  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    const inner = returnOutcome(provenance, expression.argument)
    if (inner === 'acceptance') return 'rejection'
    if (inner === 'rejection') return 'acceptance'
    return 'other'
  }
  if (expression.type !== 'CallExpression') return 'other'
  let callee: ESTree.CallExpression['callee'] = expression.callee
  while (callee.type === 'CallExpression') callee = callee.callee
  const name = callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
    ? callee.property.name
    : callee.type === 'Identifier'
    ? callee.name
    : null
  if (name !== null && (REJECTION_CALLEES[name] === true || CODEC_LAW_CALLEES[name] === true)) {
    return REJECTION_CALLEES[name] === true ? 'rejection' : 'acceptance'
  }
  if (name !== null && ACCEPTANCE_CALLEES[name] === true) return 'acceptance'
  if (callee.type === 'Identifier' && provenance.verdictOf(callee, 0) === 'schema') return 'acceptance'
  return 'other'
}

const isArbitraryArray = (argument: ESTree.CallExpression['arguments'][number]): argument is ESTree.ArrayExpression =>
  argument.type === 'ArrayExpression'

const isPredicateFunction = (
  argument: ESTree.CallExpression['arguments'][number] | undefined,
): argument is ESTree.ArrowFunctionExpression => argument !== undefined && argument.type === 'ArrowFunctionExpression'

const checkPropCall = (provenance: Provenance, context: Context, call: ESTree.CallExpression): void => {
  const arbitraries = call.arguments.find(isArbitraryArray)
  if (arbitraries === undefined) return
  let hasSchemaArbitrary = false
  for (const element of arbitraries.elements) {
    if (element === null) continue
    if (provenance.verdictOf(element, 0) === 'schema') hasSchemaArbitrary = true
  }
  if (!hasSchemaArbitrary) return
  const predicate = call.arguments[call.arguments.length - 1]
  if (!isPredicateFunction(predicate)) return
  const shape: PredicateShape = {
    leavesVocabulary: false,
    lastReturnAssertsRejection: false,
    lastReturnAssertsAcceptance: false,
  }
  if (predicate.body.type !== 'BlockStatement') {
    shape.lastReturnAssertsRejection = returnOutcome(provenance, predicate.body) === 'rejection'
    shape.lastReturnAssertsAcceptance = returnOutcome(provenance, predicate.body) === 'acceptance'
  }
  collectPredicateShape(provenance, predicate.body, shape)
  const statesOnlyAcceptance = shape.lastReturnAssertsAcceptance && !shape.lastReturnAssertsRejection
  if (shape.leavesVocabulary || !statesOnlyAcceptance) return
  context.report({
    node: call,
    messageId: 'generatedLawDuplicate',
    data: { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX },
  })
}

export const propGeneratedLawDuplicate = defineRule({
  meta,
  create(context: Context) {
    const provenance = new Provenance(context.sourceCode.getScope)
    const collect = (value: unknown, out: ESTree.CallExpression[]): void => {
      if (Array.isArray(value)) {
        for (const item of value) collect(item, out)
        return
      }
      if (!isNode(value)) return
      if (value.type === 'CallExpression' && isPropCallee(value.callee)) out.push(value)
      for (const [key, child] of Object.entries(value)) {
        if (key === 'parent') continue
        collect(child, out)
      }
    }
    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          const source = statement.source.value
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
              provenance.imports.set(specifier.local.name, { source, imported: specifier.imported.name })
            } else {
              provenance.imports.set(specifier.local.name, { source, imported: null })
            }
          }
        }
      },
      IfStatement(node: ESTree.IfStatement) {
        if (!mentionsImportMetaVitest(node.test)) return
        const calls: ESTree.CallExpression[] = []
        collect(node.consequent, calls)
        collect(node.alternate, calls)
        for (const call of calls) checkPropCall(provenance, context, call)
      },
    }
  },
})
