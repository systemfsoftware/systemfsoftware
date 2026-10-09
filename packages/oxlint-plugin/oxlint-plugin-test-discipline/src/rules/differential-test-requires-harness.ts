import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  HARNESS_PRESCRIPTION,
  meta,
  RAW_FAST_CHECK_ACTUAL,
  RAW_FAST_CHECK_EXPECTED,
  RAW_FAST_CHECK_FIX,
} from './differential-test-requires-harness.config.js'
import { harnessLaneOf, lanesOf } from './lane.js'
import { DIFFERENTIAL_PACKAGE, RAW_FC_METHODS } from './path.config.js'

export type MessageIds = 'rawFastCheck' | 'missingHarnessUsage'

const memberObjectName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : undefined

const calleeName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'Identifier' ? callee.name : memberObjectName(callee)

const recordHarnessBindings = (node: ESTree.ImportDeclaration, bindings: Set<string>): void => {
  if (harnessLaneOf(node.source.value) !== 'differential') return
  for (const specifier of node.specifiers) {
    bindings.add(specifier.local.name)
  }
}

/** The fast-check runner a raw `fc.assert(...)` style call names, if any. */
const rawFastCheckMethod = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'fc' &&
    callee.property.type === 'Identifier' && RAW_FC_METHODS[callee.property.name] === true
    ? callee.property.name
    : undefined

export const differentialTestRequiresHarness = defineRule({
  meta,
  create(context: Context) {
    const harnessBindings = new Set<string>()
    let differential = false
    let hasHarnessInvocation = false

    return {
      Program() {
        differential = lanesOf(context).has('differential')
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (differential) recordHarnessBindings(node, harnessBindings)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!differential) return
        const method = rawFastCheckMethod(node.callee)
        if (method !== undefined) {
          context.report({
            node,
            messageId: 'rawFastCheck',
            data: {
              name: `raw fc.${method}(...) in a differential test file`,
              expected: RAW_FAST_CHECK_EXPECTED,
              actual: `fc.${method}(...) ${RAW_FAST_CHECK_ACTUAL}`,
              fix: RAW_FAST_CHECK_FIX,
            },
          })
          return
        }
        const name = calleeName(node.callee)
        if (name !== undefined && harnessBindings.has(name)) hasHarnessInvocation = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (differential && !hasHarnessInvocation) {
          context.report({
            node,
            messageId: 'missingHarnessUsage',
            data: {
              name: `differential test file imports ${DIFFERENTIAL_PACKAGE} but never invokes it`,
              expected: HARNESS_PRESCRIPTION,
              actual: 'the harness is imported but no Differential.compare or Metamorphic.on chain runs',
              fix: HARNESS_PRESCRIPTION,
            },
          })
        }
      },
    }
  },
})
