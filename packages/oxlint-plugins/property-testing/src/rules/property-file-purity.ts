import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option, Schema as S } from 'effect'
import { isPropCallee, PROP_MODIFIERS } from './prop-call.js'
import { meta, Options, PROPERTY_TEST_SUFFIX } from './property-file-purity.config.js'

export type MessageIds = 'plainIt' | 'plainEffectIt' | 'rawFastCheck' | 'fastCheckImport' | 'propCall'

const RAW_FC_METHODS: ReadonlySet<string> = new Set(['assert', 'check', 'property', 'asyncProperty'])

const reportPlain = (
  context: Context,
  node: ESTree.CallExpression,
  messageId: 'plainIt' | 'plainEffectIt',
  actual: string,
): void => {
  context.report({
    node,
    messageId,
    data: {
      name: `scenario test (${actual}) in a ${PROPERTY_TEST_SUFFIX} file`,
      expected: 'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests',
      actual: `${actual} runs a single example, not a property`,
      fix:
        'move the scenario test to a plain *.test.ts file, or rewrite it as a property with arbitraries and a boolean-returning predicate',
    },
  })
}

const createPropertyFileVisitors = (context: Context) => ({
  CallExpression(node: ESTree.CallExpression) {
    const callee = node.callee
    if (callee.type === 'Identifier') {
      if (callee.name === 'it' || callee.name === 'test') {
        reportPlain(context, node, 'plainIt', `${callee.name}(...)`)
      }
      return
    }
    if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return
    const object = callee.object
    if (object.type === 'Identifier' && object.name === 'fc' && RAW_FC_METHODS.has(callee.property.name)) {
      context.report({
        node,
        messageId: 'rawFastCheck',
        data: {
          name: `raw fc.${callee.property.name}(...) in a ${PROPERTY_TEST_SUFFIX} file`,
          expected: 'it.prop(...) or it.effect.prop(...) from @effect/vitest',
          actual: `fc.${callee.property.name}(...) bypasses the vitest/Effect integration`,
          fix:
            'rewrite as it.prop(name, [arbitraries], predicate) returning a boolean; fc.* stays for building arbitraries (fc.pre, fc.stringMatching, ...)',
        },
      })
      return
    }
    if (object.type === 'Identifier' && object.name === 'it') {
      if (callee.property.name === 'effect') {
        reportPlain(context, node, 'plainEffectIt', 'it.effect(...)')
      } else if (PROP_MODIFIERS.has(callee.property.name)) {
        reportPlain(context, node, 'plainIt', `it.${callee.property.name}(...)`)
      }
      return
    }
    if (
      PROP_MODIFIERS.has(callee.property.name) && object.type === 'MemberExpression' &&
      object.object.type === 'Identifier' && object.object.name === 'it' &&
      object.property.type === 'Identifier' && object.property.name === 'effect'
    ) {
      reportPlain(context, node, 'plainEffectIt', `it.effect.${callee.property.name}(...)`)
    }
  },
})

const createScenarioFileVisitors = (context: Context) => ({
  ImportDeclaration(node: ESTree.ImportDeclaration) {
    for (const specifier of node.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' &&
        specifier.imported.name === 'FastCheck'
      ) {
        context.report({
          node: specifier,
          messageId: 'fastCheckImport',
          data: {
            name: 'FastCheck import in a scenario test file',
            expected: `property tests (and every FastCheck usage) live in ${PROPERTY_TEST_SUFFIX} files`,
            actual: `FastCheck imported by a file that is not ${PROPERTY_TEST_SUFFIX}`,
            fix: 'move the property test to a *.property.test.ts file; this file keeps plain it() scenario tests only',
          },
        })
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

export const propertyFilePurity = defineRule({
  meta,
  create(context: Context) {
    const { admitPlainStems } = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const isTestFile = A.last(context.filename.split('/')).pipe(
      Option.exists((base) => base.includes('.test.') || base.includes('.spec.')),
    )
    if (!isTestFile) return {}
    if (context.filename.endsWith(PROPERTY_TEST_SUFFIX)) return createPropertyFileVisitors(context)
    if (admitPlainStems) return {}
    return createScenarioFileVisitors(context)
  },
})
