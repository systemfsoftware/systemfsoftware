import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { basenameOf, isInTestsImportScope, isTestFile, isUnderSrc } from './path.js'
import {
  meta,
  SPAN_WIRE_NAMES,
  TELEMETRY_SPECIFIER_PREFIXES,
  TRACE_SPEC_SPECIFIER,
  TRACE_SUITE_BASENAME,
  TRACING_TEST_FIX,
} from './tracing-test-requires-trace-suite.config.js'
import { isInsideConsequent, isVitestGuard } from './vitest-guard.js'

export type MessageIds = 'telemetryInNonTraceTest'

const isTelemetrySpecifier = (source: string): boolean =>
  TELEMETRY_SPECIFIER_PREFIXES.some((prefix) => source === prefix || source.startsWith(`${prefix}/`))

/** The specifier a static, template or `require` string names, when it is a literal. */
const literalSpecifier = (node: ESTree.Node | undefined): string | null => {
  if (node === undefined) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null
  return null
}

const isTracerMember = (node: ESTree.Node, property: string): boolean =>
  node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' &&
  node.object.name === 'Tracer' && node.property.type === 'Identifier' && node.property.name === property

const isRequireCall = (node: ESTree.CallExpression): boolean =>
  (node.callee.type === 'Identifier' && node.callee.name === 'require') ||
  (node.callee.type === 'CallExpression' && node.callee.callee.type === 'Identifier' &&
    node.callee.callee.name === 'createRequire')

export const tracingTestRequiresTraceSuite = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (TRACE_SUITE_BASENAME.test(basenameOf(filename))) return {}
    const testScope = isInTestsImportScope(filename)
    const inSource = !testScope && isUnderSrc(filename)
    if (!testScope && !inSource) return {}

    const fileKind = testScope ? 'a test that is not a trace suite' : 'an in-source `import.meta.vitest` block'
    const report = (node: ESTree.Node, specifier: string, actual: string) =>
      context.report({
        node,
        messageId: 'telemetryInNonTraceTest',
        data: { specifier, fileKind, actual, fix: TRACING_TEST_FIX },
      })

    /** Local name -> specifier of a runtime import from a telemetry package, for the in-source check. */
    const telemetryBindings = new Map<string, string>()
    const guards: Array<ESTree.Node> = []
    const reported = new Set<string>()
    const insideGuard = (node: ESTree.Node & { readonly parent: ESTree.Node | null }) =>
      guards.some((consequent) => isInsideConsequent(node, consequent))

    const judgeSpecifier = (node: ESTree.Node, specifier: string | null, inGuard: boolean) => {
      if (specifier === null) return
      const applies = testScope || inGuard
      if (!applies) return
      if (isTelemetrySpecifier(specifier)) {
        report(node, specifier, `this file imports '${specifier}', which builds or exports spans`)
      } else if (specifier === TRACE_SPEC_SPECIFIER && isTestFile(basenameOf(filename))) {
        report(node, specifier, 'a trace contract is written under a suffix that is not `.trace.test.ts`')
      }
    }

    const wireNamesSeen = new Set<string>()
    const judgeWireName = (node: ESTree.Node & { readonly parent: ESTree.Node | null }, name: string) => {
      if (!SPAN_WIRE_NAMES.includes(name) || wireNamesSeen.has(name)) return
      if (!testScope && !insideGuard(node)) return
      wireNamesSeen.add(name)
      report(node, name, `this file reads '${name}', which only exported spans carry`)
    }

    return {
      IfStatement(node: ESTree.IfStatement) {
        if (isVitestGuard(node.test)) guards.push(node.consequent)
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === 'type') return
        const specifier = node.source.value
        if (testScope) return judgeSpecifier(node, specifier, false)
        if (!isTelemetrySpecifier(specifier)) return
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.importKind === 'type') continue
          telemetryBindings.set(spec.local.name, specifier)
        }
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.exportKind === 'type' || node.source === null || node.source === undefined) return
        judgeSpecifier(node, node.source.value, false)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        judgeSpecifier(node, node.source.value, false)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        judgeSpecifier(node, literalSpecifier(node.source), insideGuard(node))
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isRequireCall(node)) return judgeSpecifier(node, literalSpecifier(node.arguments[0]), insideGuard(node))
        const builds = isTracerMember(node.callee, 'make') ||
          node.arguments.some((argument) => isTracerMember(argument, 'Tracer'))
        if (builds && (testScope || insideGuard(node))) {
          report(node, 'effect/Tracer', 'this test builds or provides its own Tracer')
        }
      },
      MemberExpression(node: ESTree.MemberExpression) {
        if (!node.computed && node.property.type === 'Identifier') judgeWireName(node, node.property.name)
      },
      Property(node: ESTree.ObjectProperty) {
        if (!node.computed && node.key.type === 'Identifier') judgeWireName(node, node.key.name)
      },
      Identifier(node: ESTree.IdentifierReference) {
        if (testScope) return
        const specifier = telemetryBindings.get(node.name)
        if (specifier === undefined || reported.has(node.name) || !insideGuard(node)) return
        reported.add(node.name)
        report(node, specifier, `this block uses '${node.name}', imported from '${specifier}'`)
      },
    }
  },
})
