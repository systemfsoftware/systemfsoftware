import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { HARNESS_PRESCRIPTION, meta } from './conformance-test-requires-harness.config.js'
import { CONFORMANCE_PACKAGE, CONFORMANCE_SUFFIX, FOREIGN_RUNNERS, RUNNER_NAMES } from './path.config.js'

export type MessageIds = 'rawRunnerCall' | 'runnerImport' | 'missingHarnessImport' | 'missingHarnessUsage'

const memberObjectName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : undefined

const calleeName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'Identifier' ? callee.name : memberObjectName(callee)

const recordHarnessBindings = (node: ESTree.ImportDeclaration, bindings: Set<string>): void => {
  if (node.source.value !== CONFORMANCE_PACKAGE) return
  for (const specifier of node.specifiers) {
    bindings.add(specifier.local.name)
  }
}

const isForeignRunnerImport = (node: ESTree.ImportDeclaration): boolean =>
  typeof node.source.value === 'string' && FOREIGN_RUNNERS.has(node.source.value)

export const conformanceTestRequiresHarness = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!filename.endsWith(CONFORMANCE_SUFFIX)) return {}

    const harnessBindings = new Set<string>()
    let violations = 0
    let hasHarnessInvocation = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isForeignRunnerImport(node)) {
          context.report({
            node,
            messageId: 'runnerImport',
            data: {
              name: `runner import from ${String(node.source.value)} in a conformance test file`,
              expected: HARNESS_PRESCRIPTION,
              actual: 'a direct vitest / @effect/vitest runner import bypasses the conformance check',
              fix: `delete the runner import; ${HARNESS_PRESCRIPTION}`,
            },
          })
          violations += 1
          return
        }
        recordHarnessBindings(node, harnessBindings)
      },
      CallExpression(node: ESTree.CallExpression) {
        const name = calleeName(node.callee)
        if (name !== undefined && RUNNER_NAMES.has(name)) {
          context.report({
            node,
            messageId: 'rawRunnerCall',
            data: {
              name: `raw runner call (${name}) in a conformance test file`,
              expected: HARNESS_PRESCRIPTION,
              actual: `${name}(...) bypasses the conformance check`,
              fix: `rewrite using ${HARNESS_PRESCRIPTION}`,
            },
          })
          violations += 1
          return
        }
        if (name !== undefined && harnessBindings.has(name)) hasHarnessInvocation = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (harnessBindings.size === 0) {
          context.report({
            node,
            messageId: 'missingHarnessImport',
            data: {
              name: `conformance test file without ${CONFORMANCE_PACKAGE} import`,
              expected: HARNESS_PRESCRIPTION,
              actual: 'no conformance check import found',
              fix: HARNESS_PRESCRIPTION,
            },
          })
          return
        }
        if (!hasHarnessInvocation && violations === 0) {
          context.report({
            node,
            messageId: 'missingHarnessUsage',
            data: {
              name: `conformance test file imports ${CONFORMANCE_PACKAGE} but never invokes it`,
              expected: HARNESS_PRESCRIPTION,
              actual:
                'a check is imported but no Linearizable.check, SequentialModel.check, or Released.check call runs',
              fix: HARNESS_PRESCRIPTION,
            },
          })
        }
      },
    }
  },
})
