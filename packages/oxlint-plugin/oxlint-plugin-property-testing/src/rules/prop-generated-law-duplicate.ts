import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Provenance } from './prop-arbitrary-schema-origin.js'
import { isPropCallee } from './prop-call.js'
import {
  COMPILER_ACTUAL,
  COMPILER_EXPECTED,
  COMPILER_FIX,
  COMPILER_NAME,
  meta,
  NO_FUNCTION_ACTUAL,
  NO_FUNCTION_EXPECTED,
  NO_FUNCTION_FIX,
  NO_FUNCTION_NAME,
} from './prop-generated-law-duplicate.config.js'

export type MessageIds = 'compilerDuplicate' | 'noDomainFunction'

/**
 * Codec accessors and iteration/string combinators: a call whose terminal name
 * lands in either list never counts as the function under test.
 */
const CODEC_ACCESSORS: Record<string, true> = {
  encode: true,
  encodeSync: true,
  encodeExit: true,
  encodeUnknownSync: true,
  encodeUnknownExit: true,
  encodeOption: true,
  decode: true,
  decodeSync: true,
  decodeExit: true,
  decodeUnknownSync: true,
  decodeUnknownExit: true,
  decodeOption: true,
  decodeEither: true,
  decodePromise: true,
  decodeUnknownPromise: true,
  isSuccess: true,
  isFailure: true,
  isRight: true,
  isLeft: true,
  isSome: true,
  isNone: true,
  toEquivalence: true,
  toEncoded: true,
  toArbitrary: true,
  Exit: true,
}

const NEUTRAL_METHODS: Record<string, true> = {
  every: true,
  some: true,
  includes: true,
  map: true,
  filter: true,
  find: true,
  join: true,
  split: true,
  trim: true,
  toLowerCase: true,
  toUpperCase: true,
  replaceAll: true,
  replace: true,
  indexOf: true,
  startsWith: true,
  endsWith: true,
  concat: true,
  slice: true,
  get: true,
  set: true,
  has: true,
  keys: true,
  values: true,
  entries: true,
  forEach: true,
  reduce: true,
  test: true,
  match: true,
  gen: true,
}

type PredicateShape = {
  usesCompilerProbe: boolean
  callsDomainFunction: boolean
}

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

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
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    if (node.property.name === 'getOwnPropertySymbols' || node.property.name === 'getOwnPropertyNames') {
      shape.usesCompilerProbe = true
    }
  }
  if (node.type === 'Identifier' && node.name.endsWith('TypeId')) {
    shape.usesCompilerProbe = true
  }
  if (node.type === 'CallExpression') {
    let callee: ESTree.CallExpression['callee'] = node.callee
    while (callee.type === 'CallExpression') callee = callee.callee
    if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
      const name = callee.property.name
      if (CODEC_ACCESSORS[name] !== true && NEUTRAL_METHODS[name] !== true) {
        const receiverIsLocal = callee.object.type === 'Identifier' &&
          provenance.isLocalBinding(callee.object.name, node)
        if (provenance.classifyCall(name, node) === 'domain' || receiverIsLocal) shape.callsDomainFunction = true
      }
    } else if (callee.type === 'Identifier') {
      if (
        CODEC_ACCESSORS[callee.name] !== true &&
        NEUTRAL_METHODS[callee.name] !== true &&
        provenance.classifyCall(callee.name, node) === 'domain'
      ) {
        shape.callsDomainFunction = true
      }
    }
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue
    collectPredicateShape(provenance, child, shape)
  }
}

const checkPropCall = (provenance: Provenance, context: Context, call: ESTree.CallExpression): void => {
  const predicate = call.arguments[call.arguments.length - 1]
  if (predicate === undefined || predicate.type !== 'ArrowFunctionExpression') return
  const shape: PredicateShape = { usesCompilerProbe: false, callsDomainFunction: false }
  collectPredicateShape(provenance, predicate.body, shape)
  if (shape.usesCompilerProbe) {
    context.report({
      node: call,
      messageId: 'compilerDuplicate',
      data: { name: COMPILER_NAME, expected: COMPILER_EXPECTED, actual: COMPILER_ACTUAL, fix: COMPILER_FIX },
    })
    return
  }
  if (!shape.callsDomainFunction) {
    context.report({
      node: call,
      messageId: 'noDomainFunction',
      data: {
        name: NO_FUNCTION_NAME,
        expected: NO_FUNCTION_EXPECTED,
        actual: NO_FUNCTION_ACTUAL,
        fix: NO_FUNCTION_FIX,
      },
    })
  }
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
