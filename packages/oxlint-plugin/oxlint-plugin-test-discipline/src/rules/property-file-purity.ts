import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { fastCheckImportSites, isPropertyFile, lanesOf, mixesPropertyIntoAHarness } from './lane.js'
import { RAW_FC_METHODS } from './path.config.js'
import { isPropCallee, PROP_MODIFIERS } from './prop-call.js'
import {
  meta,
  MIXED_FAST_CHECK_IMPORT_DATA,
  MIXED_PROP_CALL_DATA,
  PLAIN_EXPECTED,
  PLAIN_FIX,
  RAW_FAST_CHECK_ACTUAL,
  RAW_FAST_CHECK_EXPECTED,
  RAW_FAST_CHECK_FIX,
} from './property-file-purity.config.js'

export type MessageIds = 'plainIt' | 'plainEffectIt' | 'rawFastCheck' | 'fastCheckImport' | 'propCall'

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
      name: `scenario test (${actual}) in a property test file`,
      expected: PLAIN_EXPECTED,
      actual: `${actual} runs a single example, not a property`,
      fix: PLAIN_FIX,
    },
  })
}

const reportRawFc = (context: Context, node: ESTree.CallExpression, method: string): void => {
  context.report({
    node,
    messageId: 'rawFastCheck',
    data: {
      name: `raw fc.${method}(...) in a property test file`,
      expected: RAW_FAST_CHECK_EXPECTED,
      actual: `fc.${method}(...) ${RAW_FAST_CHECK_ACTUAL}`,
      fix: RAW_FAST_CHECK_FIX,
    },
  })
}

const checkCall = (context: Context, node: ESTree.CallExpression): void => {
  const callee = node.callee
  if (callee.type === 'Identifier') {
    if (callee.name === 'it' || callee.name === 'test') reportPlain(context, node, 'plainIt', `${callee.name}(...)`)
    return
  }
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return
  const object = callee.object
  if (object.type === 'Identifier' && object.name === 'fc' && RAW_FC_METHODS[callee.property.name] === true) {
    reportRawFc(context, node, callee.property.name)
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
}

export const propertyFilePurity = defineRule({
  meta,
  create(context: Context) {
    let property = false
    let mixed = false
    return {
      Program() {
        const lanes = lanesOf(context)
        mixed = mixesPropertyIntoAHarness(lanes)
        property = !mixed && isPropertyFile(lanes)
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!mixed) return
        for (const site of fastCheckImportSites(node)) {
          context.report({ node: site, messageId: 'fastCheckImport', data: MIXED_FAST_CHECK_IMPORT_DATA })
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (mixed && isPropCallee(node.callee)) {
          context.report({ node, messageId: 'propCall', data: MIXED_PROP_CALL_DATA })
        } else if (property) {
          checkCall(context, node)
        }
      },
    }
  },
})
