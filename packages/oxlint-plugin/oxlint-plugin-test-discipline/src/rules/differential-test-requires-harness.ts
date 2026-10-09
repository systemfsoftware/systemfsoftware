import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  RAW_FAST_CHECK_ACTUAL,
  RAW_FAST_CHECK_EXPECTED,
  RAW_FAST_CHECK_FIX,
} from './differential-test-requires-harness.config.js'
import { harnessLaneOf, lanesOf } from './lane.js'
import { DIFFERENTIAL_PACKAGE, FOREIGN_RUNNERS, RAW_FC_METHODS, RUNNER_NAMES } from './path.config.js'

export type MessageIds = 'rawRunnerCall' | 'runnerImport' | 'rawFastCheck' | 'missingHarnessUsage'

const HARNESS_PRESCRIPTION =
  'import { Differential, Metamorphic } from @systemfsoftware/differential-spec and express the test as Differential.compare({ name, reference, candidate }).on(arb).assert(oracle) or Metamorphic.on({ name, system }).relation({ transformInput, assertOutput }).on(arb)'

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

const isForeignRunnerImport = (node: ESTree.ImportDeclaration): boolean =>
  typeof node.source.value === 'string' && FOREIGN_RUNNERS[node.source.value] === true

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
    let violations = 0
    let hasHarnessInvocation = false

    return {
      Program() {
        differential = lanesOf(context).has('differential')
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!differential) return
        if (isForeignRunnerImport(node)) {
          context.report({
            node,
            messageId: 'runnerImport',
            data: {
              name: `runner import from ${String(node.source.value)} in a differential test file`,
              expected: HARNESS_PRESCRIPTION,
              actual:
                'a direct vitest / @effect/vitest / @systemfsoftware/vitest runner import bypasses the differential oracle',
              fix: `delete the runner import; ${HARNESS_PRESCRIPTION}`,
            },
          })
          violations += 1
          return
        }
        recordHarnessBindings(node, harnessBindings)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!differential) return
        const name = calleeName(node.callee)
        if (name !== undefined && RUNNER_NAMES.has(name)) {
          context.report({
            node,
            messageId: 'rawRunnerCall',
            data: {
              name: `raw runner call (${name}) in a differential test file`,
              expected: HARNESS_PRESCRIPTION,
              actual: `${name}(...) bypasses the differential oracle`,
              fix: `rewrite using ${HARNESS_PRESCRIPTION}`,
            },
          })
          violations += 1
          return
        }
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
        if (name !== undefined && harnessBindings.has(name)) hasHarnessInvocation = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (differential && !hasHarnessInvocation && violations === 0) {
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
