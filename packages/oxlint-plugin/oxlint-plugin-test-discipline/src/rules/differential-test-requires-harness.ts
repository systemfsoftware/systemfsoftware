import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './differential-test-requires-harness.config.js'
import { DIFFERENTIAL_PACKAGE, DIFFERENTIAL_SUFFIX, FOREIGN_RUNNERS, RUNNER_NAMES } from './path.config.js'

export type MessageIds = 'rawRunnerCall' | 'runnerImport' | 'missingHarnessImport' | 'missingHarnessUsage'

interface ReportBody {
  readonly messageId: MessageIds
  readonly data: { readonly name: string; readonly expected: string; readonly actual: string; readonly fix: string }
}

const HARNESS_PRESCRIPTION =
  'import { Differential, Metamorphic } from @systemfsoftware/differential-spec and express the test as Differential.compare({ name, reference, candidate }).on(arb).assert(oracle) or Metamorphic.on({ name, system }).relation({ transformInput, assertOutput }).on(arb)'

const memberObjectName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : undefined

const calleeName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'Identifier' ? callee.name : memberObjectName(callee)

const recordHarnessBindings = (node: ESTree.ImportDeclaration, bindings: Set<string>): void => {
  if (node.source.value !== DIFFERENTIAL_PACKAGE) return
  for (const specifier of node.specifiers) {
    bindings.add(specifier.local.name)
  }
}

const isForeignRunnerImport = (node: ESTree.ImportDeclaration): boolean =>
  typeof node.source.value === 'string' && FOREIGN_RUNNERS[node.source.value] === true

const runnerImportError = (source: string) => ({
  messageId: 'runnerImport' as const,
  data: {
    name: `runner import from ${source} in a differential test file`,
    expected: HARNESS_PRESCRIPTION,
    actual: 'a direct vitest / @effect/vitest / @systemfsoftware/vitest runner import bypasses the differential oracle',
    fix: `delete the runner import; ${HARNESS_PRESCRIPTION}`,
  },
})

const rawRunnerError = (name: string) => ({
  messageId: 'rawRunnerCall' as const,
  data: {
    name: `raw runner call (${name}) in a differential test file`,
    expected: HARNESS_PRESCRIPTION,
    actual: `${name}(...) bypasses the differential oracle`,
    fix: `rewrite using ${HARNESS_PRESCRIPTION}`,
  },
})

/**
 * A differential test is a file that drives the differential oracle. The gate
 * is keyed on BOTH facts that make it one: the `.differential.test.ts` suffix
 * (CONST-N2 naming/placement) AND an import of the differential-spec harness
 * (what the file actually calls, resolvable from the module graph). Keying the
 * harness requirement on the suffix ALONE is the CONST-T12 harm: a rename to
 * `foo.diff.test.ts` would silently drop every check here while the suite still
 * looked complete. The import trigger closes that: a renamed file that still
 * reaches `@systemfsoftware/differential-spec` is still held to the harness.
 * The `missingHarnessImport` branch necessarily stays suffix-only — a file that
 * imports nothing from the harness is only known to BE a differential test from
 * its name — so a renamed-and-emptied file is caught by the merge/placement
 * rules, not here; this rule stops a renamed file from escaping the harness
 * discipline it was already using.
 */
export const differentialTestRequiresHarness = defineRule({
  meta,
  create(context: Context) {
    const matchesSuffix = context.filename.endsWith(DIFFERENTIAL_SUFFIX)

    const harnessBindings = new Set<string>()
    const reports: { readonly node: ESTree.Node; readonly report: ReportBody }[] = []
    let violations = 0
    let hasHarnessInvocation = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isForeignRunnerImport(node)) {
          reports.push({ node, report: runnerImportError(String(node.source.value)) })
          violations += 1
          return
        }
        recordHarnessBindings(node, harnessBindings)
      },
      CallExpression(node: ESTree.CallExpression) {
        const name = calleeName(node.callee)
        if (name !== undefined && RUNNER_NAMES.has(name)) {
          reports.push({ node, report: rawRunnerError(name) })
          violations += 1
          return
        }
        if (name !== undefined && harnessBindings.has(name)) hasHarnessInvocation = true
      },
      'Program:exit'(node: ESTree.Program) {
        // The file is a differential test when its name says so OR when it
        // reaches the harness: either fact alone makes the discipline apply, so
        // a rename cannot drop it while an import survives.
        const isSubject = matchesSuffix || harnessBindings.size > 0
        if (!isSubject) return
        for (const { node: at, report } of reports) context.report({ node: at, ...report })
        if (harnessBindings.size === 0) {
          context.report({
            node,
            messageId: 'missingHarnessImport',
            data: {
              name: `differential test file without ${DIFFERENTIAL_PACKAGE} import`,
              expected: HARNESS_PRESCRIPTION,
              actual: 'no differential harness import found',
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
