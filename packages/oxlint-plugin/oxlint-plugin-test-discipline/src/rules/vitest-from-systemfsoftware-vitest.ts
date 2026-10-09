import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { lanesOf } from './lane.js'
import { FOREIGN_RUNNERS, FOREIGN_VITEST_SOURCES, RUNNER_NAMES } from './path.config.js'
import { isRawVitestPackage } from './path.js'
import {
  CALL_LANES,
  type HarnessLane,
  meta,
  PRESCRIPTIONS,
  RUNNER_LANES,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from './vitest-from-systemfsoftware-vitest.config.js'

export type MessageIds = 'vitestImport' | 'runnerImport' | 'rawRunnerCall'

const isTypeOnly = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return true
  if (node.specifiers.length === 0) return false
  return node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  )
}

const isForeignVitestLiteral = (node: ESTree.Expression): boolean =>
  node.type === 'Literal' && typeof node.value === 'string' && FOREIGN_VITEST_SOURCES[node.value] === true

/** The runner a value import specifier names; a string-literal import name never names one. */
const runnerNameOf = (specifier: ESTree.ImportDeclaration['specifiers'][number]): string | undefined =>
  specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type' &&
    specifier.imported.type === 'Identifier' && RUNNER_NAMES.has(specifier.imported.name)
    ? specifier.imported.name
    : undefined

/** A value the declaration binds besides a runner: what still makes it a foreign vitest import. */
const bindsANonRunnerValue = (node: ESTree.ImportDeclaration): boolean =>
  node.specifiers.length === 0 || node.specifiers.some(
    (specifier) =>
      runnerNameOf(specifier) === undefined &&
      !(specifier.type === 'ImportSpecifier' && specifier.importKind === 'type'),
  )

const memberObjectName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : undefined

const calleeName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'Identifier' ? callee.name : memberObjectName(callee)

export const vitestFromSystemfsoftwareVitest = defineRule({
  meta,
  create(context: Context) {
    const rawVitestPackage = isRawVitestPackage(context.filename)
    const importedRunners = new Set<string>()
    let lane: HarnessLane | undefined

    const report = (node: ESTree.Node): void => {
      if (rawVitestPackage) return
      context.report({
        node,
        messageId: 'vitestImport',
        data: {
          name: VIOLATION_NAME,
          expected: VIOLATION_EXPECTED,
          actual: VIOLATION_ACTUAL,
          fix: VIOLATION_FIX,
        },
      })
    }

    /**
     * In a harness lane the harness owns the runner: one finding per runner the
     * import names, and the lane arm is the only reporter of that runner.
     */
    const reportRunnerImports = (node: ESTree.ImportDeclaration, harness: HarnessLane): void => {
      for (const specifier of node.specifiers) {
        const runner = runnerNameOf(specifier)
        if (runner === undefined) continue
        importedRunners.add(specifier.local.name)
        context.report({
          node: specifier,
          messageId: 'runnerImport',
          data: {
            name: `${runner} imported from ${node.source.value} in a ${harness} test`,
            expected: PRESCRIPTIONS[harness],
            actual: `a runner imported from a runner package bypasses the ${harness} harness`,
            fix: `delete the runner import; ${PRESCRIPTIONS[harness]}`,
          },
        })
      }
    }

    return {
      Program() {
        const lanes = lanesOf(context)
        lane = RUNNER_LANES.find((harness) => lanes.has(harness))
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        const harness = FOREIGN_RUNNERS[source] === true ? lane : undefined
        if (harness !== undefined) reportRunnerImports(node, harness)
        if (FOREIGN_VITEST_SOURCES[source] !== true) return
        if (isTypeOnly(node)) return
        if (harness !== undefined && !bindsANonRunnerValue(node)) return
        report(node)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (lane === undefined || !CALL_LANES[lane]) return
        const name = calleeName(node.callee)
        if (name === undefined || !RUNNER_NAMES.has(name) || importedRunners.has(name)) return
        context.report({
          node,
          messageId: 'rawRunnerCall',
          data: {
            name: `raw runner call (${name}) in a ${lane} test`,
            expected: PRESCRIPTIONS[lane],
            actual: `${name}(...) bypasses the ${lane} harness`,
            fix: `rewrite using ${PRESCRIPTIONS[lane]}`,
          },
        })
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (!isForeignVitestLiteral(node.source)) return
        report(node)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        if (FOREIGN_VITEST_SOURCES[node.source.value] !== true) return
        report(node)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null || node.exportKind === 'type') return
        if (FOREIGN_VITEST_SOURCES[node.source.value] !== true) return
        report(node)
      },
    }
  },
})
