import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { DIFFERENTIAL_SUFFIX } from './path.config.js'
import { basenameOf, isTestFile } from './path.js'
import { isPropCallee, PROP_MODIFIERS } from './prop-call.js'
import { meta, PROPERTY_TEST_SUFFIX } from './property-file-purity.config.js'

export type MessageIds = 'plainIt' | 'plainEffectIt' | 'rawFastCheck' | 'fastCheckImport' | 'propCall'

const RAW_FC_METHODS: ReadonlySet<string> = new Set(['assert', 'check', 'property', 'asyncProperty'])

interface PropertyFileKind {
  readonly suffix: string
  readonly plainExpected: string
  readonly plainFix: string
  readonly rawFcExpected: string
  readonly rawFcActualSuffix: string
  readonly rawFcFix: string
}

const PROPERTY_FILE_KIND: PropertyFileKind = {
  suffix: PROPERTY_TEST_SUFFIX,
  plainExpected: 'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests',
  plainFix:
    'move the scenario test to a plain *.test.ts file, or rewrite it as a property with arbitraries and a boolean-returning predicate',
  rawFcExpected: 'it.prop(...) or it.effect.prop(...) from @effect/vitest',
  rawFcActualSuffix: 'bypasses the vitest/Effect integration',
  rawFcFix:
    'rewrite as it.prop(name, { of, subject, runs }, holds) returning a boolean; fc.* stays for building arbitraries (fc.pre, fc.stringMatching, ...)',
}

const DIFFERENTIAL_FILE_KIND: PropertyFileKind = {
  suffix: DIFFERENTIAL_SUFFIX,
  plainExpected:
    'the differential harness — Differential.compare(...).on(arb).assert(oracle) or Metamorphic.on(system).relation(...).on(arb)',
  plainFix: 'rewrite via @systemfsoftware/differential-spec; scenario tests do not belong in a differential file',
  rawFcExpected:
    'the harness owns fast-check — pass an fc.Arbitrary to the harness, never call fc.assert/fc.check directly',
  rawFcActualSuffix: 'bypasses the differential harness oracle',
  rawFcFix:
    'build the arbitrary in tests/__fixtures__ and hand it to Differential.compare(...).on(arb) or Metamorphic.on(...).relation(...).on(arb)',
}

const reportPlain = (
  context: Context,
  node: ESTree.CallExpression,
  messageId: 'plainIt' | 'plainEffectIt',
  actual: string,
  kind: PropertyFileKind,
): void => {
  context.report({
    node,
    messageId,
    data: {
      name: `scenario test (${actual}) in a ${kind.suffix} file`,
      expected: kind.plainExpected,
      actual: `${actual} runs a single example, not a property`,
      fix: kind.plainFix,
    },
  })
}

const reportRawFc = (context: Context, node: ESTree.CallExpression, method: string, kind: PropertyFileKind): void => {
  context.report({
    node,
    messageId: 'rawFastCheck',
    data: {
      name: `raw fc.${method}(...) in a ${kind.suffix} file`,
      expected: kind.rawFcExpected,
      actual: `fc.${method}(...) ${kind.rawFcActualSuffix}`,
      fix: kind.rawFcFix,
    },
  })
}

const createPropertyFileVisitors = (context: Context, kind: PropertyFileKind) => ({
  CallExpression(node: ESTree.CallExpression) {
    const callee = node.callee
    if (callee.type === 'Identifier') {
      if (callee.name === 'it' || callee.name === 'test') {
        reportPlain(context, node, 'plainIt', `${callee.name}(...)`, kind)
      }
      return
    }
    if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return
    const object = callee.object
    if (object.type === 'Identifier' && object.name === 'fc' && RAW_FC_METHODS.has(callee.property.name)) {
      reportRawFc(context, node, callee.property.name, kind)
      return
    }
    if (object.type === 'Identifier' && object.name === 'it') {
      if (callee.property.name === 'effect') {
        reportPlain(context, node, 'plainEffectIt', 'it.effect(...)', kind)
      } else if (PROP_MODIFIERS.has(callee.property.name)) {
        reportPlain(context, node, 'plainIt', `it.${callee.property.name}(...)`, kind)
      }
      return
    }
    if (
      PROP_MODIFIERS.has(callee.property.name) && object.type === 'MemberExpression' &&
      object.object.type === 'Identifier' && object.object.name === 'it' &&
      object.property.type === 'Identifier' && object.property.name === 'effect'
    ) {
      reportPlain(context, node, 'plainEffectIt', `it.effect.${callee.property.name}(...)`, kind)
    }
  },
})

const FAST_CHECK_IMPORT_DATA = {
  name: 'FastCheck import in a scenario test file',
  expected: `property tests (and every FastCheck usage) live in ${PROPERTY_TEST_SUFFIX} files`,
  actual: `FastCheck imported by a file that is not ${PROPERTY_TEST_SUFFIX}`,
  fix: 'move the property test to a *.property.test.ts file; this file keeps plain it() scenario tests only',
} as const

const reportFastCheckImport = (context: Context, node: ESTree.Node): void => {
  context.report({
    node,
    messageId: 'fastCheckImport',
    data: FAST_CHECK_IMPORT_DATA,
  })
}

const createScenarioFileVisitors = (context: Context) => ({
  ImportDeclaration(node: ESTree.ImportDeclaration) {
    if (node.source.value === 'fast-check' || node.source.value.startsWith('fast-check/')) {
      reportFastCheckImport(context, node)
      return
    }
    for (const specifier of node.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' &&
        specifier.imported.name === 'FastCheck'
      ) {
        reportFastCheckImport(context, specifier)
      }
    }
  },
  CallExpression(node: ESTree.CallExpression) {
    if (!isPropCallee(node.callee)) return
    context.report({
      node,
      messageId: 'propCall',
      data: {
        name: 'property test in a non-property test file',
        expected: `it.prop / it.effect.prop calls live in ${PROPERTY_TEST_SUFFIX} files`,
        actual: 'a property test mixed into a test file that is not a property file',
        fix: 'move this test to a *.property.test.ts file — property and non-property tests never mix',
      },
    })
  },
})

const kindOf = (filename: string): PropertyFileKind =>
  filename.endsWith(DIFFERENTIAL_SUFFIX) ? DIFFERENTIAL_FILE_KIND : PROPERTY_FILE_KIND

export const propertyFilePurity = defineRule({
  meta,
  create(context: Context) {
    if (!isTestFile(basenameOf(context.filename))) return {}
    if (context.filename.endsWith(PROPERTY_TEST_SUFFIX) || context.filename.endsWith(DIFFERENTIAL_SUFFIX)) {
      return createPropertyFileVisitors(context, kindOf(context.filename))
    }
    return createScenarioFileVisitors(context)
  },
})
