import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  HARNESS_BINDING,
  HARNESS_MEMBERS,
  HARNESS_PRESCRIPTION,
  LEGACY_CHECK_MEMBER,
  meta,
} from './conformance-test-requires-harness.config.js'
import { CONFORMANCE_PACKAGE, CONFORMANCE_SUFFIX, FOREIGN_RUNNERS, RUNNER_NAMES } from './path.config.js'

export type MessageIds =
  | 'rawRunnerCall'
  | 'runnerImport'
  | 'missingHarnessImport'
  | 'legacyHarnessCall'
  | 'missingHarnessUsage'

interface ReportBody {
  readonly messageId: MessageIds
  readonly data: { readonly name: string; readonly expected: string; readonly actual: string; readonly fix: string }
}

const memberObjectName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : undefined

const memberPropertyName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : undefined

const memberName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'Identifier' ? callee.name : memberPropertyName(callee)

const calleeName = (callee: ESTree.CallExpression['callee']): string | undefined =>
  callee.type === 'Identifier' ? callee.name : memberObjectName(callee)

const isRawRunnerCall = (callee: ESTree.CallExpression['callee']): boolean => {
  const name = calleeName(callee)
  return name !== undefined && RUNNER_NAMES.has(name)
}

const isForeignRunnerImport = (node: ESTree.ImportDeclaration): boolean =>
  typeof node.source.value === 'string' && FOREIGN_RUNNERS[node.source.value] === true

const namesConformanceExport = (specifier: ESTree.ImportSpecifier): boolean =>
  specifier.imported.type === 'Identifier' && specifier.imported.name === HARNESS_BINDING

const recordBindings = (
  node: ESTree.ImportDeclaration,
  packageBindings: Set<string>,
  conformanceBindings: Set<string>,
): void => {
  if (node.source.value !== CONFORMANCE_PACKAGE) return
  for (const specifier of node.specifiers) {
    packageBindings.add(specifier.local.name)
    if (specifier.type === 'ImportSpecifier' && namesConformanceExport(specifier)) {
      conformanceBindings.add(specifier.local.name)
    }
  }
}

const isHarnessInvocation = (
  callee: ESTree.CallExpression['callee'],
  conformanceBindings: ReadonlySet<string>,
): boolean => {
  const member = memberName(callee)
  const root = calleeName(callee)
  return member !== undefined && HARNESS_MEMBERS[member] === true && root !== undefined && conformanceBindings.has(root)
}

const isLegacyCheck = (callee: ESTree.CallExpression['callee'], packageBindings: ReadonlySet<string>): boolean => {
  const root = calleeName(callee)
  return memberName(callee) === LEGACY_CHECK_MEMBER && root !== undefined && packageBindings.has(root)
}

const legacyCallText = (callee: ESTree.CallExpression['callee']): string =>
  callee.type === 'Identifier' ? callee.name : `${calleeName(callee)}.${LEGACY_CHECK_MEMBER}`

const legacyCheckError = (callee: ESTree.CallExpression['callee']) => ({
  messageId: 'legacyHarnessCall' as const,
  data: {
    name: `a .${LEGACY_CHECK_MEMBER}(...) call in a conformance test file`,
    expected: HARNESS_PRESCRIPTION,
    actual: `${legacyCallText(callee)} is not a check the barrel exposes`,
    fix: HARNESS_PRESCRIPTION,
  },
})

const runnerImportError = (source: string) => ({
  messageId: 'runnerImport' as const,
  data: {
    name: `runner import from ${source} in a conformance test file`,
    expected: HARNESS_PRESCRIPTION,
    actual: 'a direct vitest / @effect/vitest / @systemfsoftware/vitest runner import bypasses the conformance check',
    fix: `delete the runner import; ${HARNESS_PRESCRIPTION}`,
  },
})

const rawRunnerError = (name: string) => ({
  messageId: 'rawRunnerCall' as const,
  data: {
    name: `raw runner call (${name}) in a conformance test file`,
    expected: HARNESS_PRESCRIPTION,
    actual: `${name}(...) bypasses the conformance check`,
    fix: `rewrite using ${HARNESS_PRESCRIPTION}`,
  },
})

/**
 * A conformance test is a file that drives the conformance barrel. The gate is
 * keyed on BOTH facts that make it one: the `.conformance.test.ts` suffix
 * (CONST-N2 naming/placement) AND an import of the conformance-spec harness
 * (what the file actually calls, resolvable from the module graph). Keying the
 * harness requirement on the suffix ALONE is the CONST-T12 harm: a rename to
 * `foo.conf.test.ts` would silently drop every check while the suite still
 * looked complete. The import trigger closes that: a renamed file that still
 * reaches `@systemfsoftware/conformance-spec` is still held to the barrel. The
 * `missingHarnessImport` branch necessarily stays suffix-only — a file that
 * imports nothing from the harness is only known to BE a conformance test from
 * its name.
 */
export const conformanceTestRequiresHarness = defineRule({
  meta,
  create(context: Context) {
    const matchesSuffix = context.filename.endsWith(CONFORMANCE_SUFFIX)

    const packageBindings = new Set<string>()
    const conformanceBindings = new Set<string>()
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
        recordBindings(node, packageBindings, conformanceBindings)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isRawRunnerCall(node.callee)) {
          const name = calleeName(node.callee) ?? ''
          reports.push({ node, report: rawRunnerError(name) })
          violations += 1
          return
        }
        if (isHarnessInvocation(node.callee, conformanceBindings)) {
          hasHarnessInvocation = true
          return
        }
        if (isLegacyCheck(node.callee, packageBindings)) {
          reports.push({ node, report: legacyCheckError(node.callee) })
          violations += 1
        }
      },
      'Program:exit'(node: ESTree.Program) {
        // A conformance test by name OR by harness import: either fact alone
        // makes the barrel discipline apply, so a rename cannot drop it while
        // an import survives.
        const isSubject = matchesSuffix || packageBindings.size > 0
        if (!isSubject) return
        for (const { node: at, report } of reports) context.report({ node: at, ...report })
        if (packageBindings.size === 0) {
          context.report({
            node,
            messageId: 'missingHarnessImport',
            data: {
              name: `conformance test file without the ${CONFORMANCE_PACKAGE} import`,
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
              actual: 'no Conformance.linearizable, Conformance.sequential, or Conformance.released call runs',
              fix: HARNESS_PRESCRIPTION,
            },
          })
        }
      },
    }
  },
})
