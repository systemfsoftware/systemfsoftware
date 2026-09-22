import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EMIT_CALLEES } from './ban-raw-span-name-emit.config.js'
import { TRACE_SPEC_PACKAGE, TRACE_SUFFIX } from './path.config.js'
import {
  HARNESS_PRESCRIPTION,
  HTTP_TERMINATION_ACTUAL,
  HTTP_TERMINATION_EXPECTED,
  HTTP_TERMINATION_FIX,
  meta,
  MISSING_HARNESS_ACTUAL,
  RAW_EMIT_ACTUAL,
  RAW_EMIT_EXPECTED,
  RAW_EMIT_FIX,
} from './trace-test-requires-taxonomy.config.js'

export type MessageIds = 'missingHarnessImport' | 'httpTermination' | 'rawEmitCall'

const HTTP_MEMBERS: Record<string, true> = { body: true, status: true, statusText: true }

const asIdentifierName = (
  expression: ESTree.Expression | ESTree.SpreadElement | ESTree.PrivateIdentifier | undefined,
): string | null => {
  if (expression === undefined || expression.type !== 'Identifier') return null
  return expression.name
}

const isEmitCallee = (name: string): boolean => EMIT_CALLEES.some((emit) => emit === name)

const isExpectCall = (node: ESTree.Node | undefined): node is ESTree.CallExpression =>
  node?.type === 'CallExpression' && asIdentifierName(node.callee) === 'expect'

const expectCallUnder = (node: ESTree.CallExpression): ESTree.CallExpression | null => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression' || !isExpectCall(callee.object)) return null
  return callee.object
}

const memberReadName = (argument: ESTree.CallExpression['arguments'][number] | undefined): string | null => {
  if (argument === undefined || argument.type !== 'MemberExpression') return null
  return asIdentifierName(argument.property)
}

const httpReadName = (node: ESTree.CallExpression): string | null => {
  const read = memberReadName(expectCallUnder(node)?.arguments[0])
  if (read === null || HTTP_MEMBERS[read] !== true) return null
  return read
}

const memberEmitName = (callee: ESTree.CallExpression['callee']): string | null => {
  if (callee.type !== 'MemberExpression') return null
  return callee.computed ? null : asIdentifierName(callee.property)
}

const emitCalleeName = (node: ESTree.CallExpression): string | null => {
  const direct = asIdentifierName(node.callee)
  return direct ?? memberEmitName(node.callee)
}

const rawEmitName = (node: ESTree.CallExpression): string | null => {
  const name = emitCalleeName(node)
  if (name === null || !isEmitCallee(name)) return null
  return name
}

const hasHarnessBinding = (node: ESTree.ImportDeclaration): boolean =>
  node.source.value === TRACE_SPEC_PACKAGE && node.specifiers.length > 0

const reportRawEmit = (context: Context, node: ESTree.CallExpression): void => {
  const name = rawEmitName(node)
  if (name === null) return
  context.report({
    node,
    messageId: 'rawEmitCall',
    data: {
      name: `${name}(...) inside a trace spec`,
      expected: RAW_EMIT_EXPECTED,
      actual: RAW_EMIT_ACTUAL,
      fix: RAW_EMIT_FIX,
    },
  })
}

const reportHttpTermination = (context: Context, node: ESTree.CallExpression): void => {
  const member = httpReadName(node)
  if (member === null) return
  context.report({
    node,
    messageId: 'httpTermination',
    data: {
      name: `expect(...${member}) inside a trace spec`,
      expected: HTTP_TERMINATION_EXPECTED,
      actual: HTTP_TERMINATION_ACTUAL,
      fix: HTTP_TERMINATION_FIX,
    },
  })
}

export const traceTestRequiresTaxonomy = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(TRACE_SUFFIX)) return {}

    let hasHarnessImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (hasHarnessBinding(node)) hasHarnessImport = true
      },
      CallExpression(node: ESTree.CallExpression) {
        reportRawEmit(context, node)
        reportHttpTermination(context, node)
      },
      'Program:exit'(node: ESTree.Program) {
        if (hasHarnessImport) return
        context.report({
          node,
          messageId: 'missingHarnessImport',
          data: {
            name: `a *.trace.test.ts without ${TRACE_SPEC_PACKAGE}`,
            expected: HARNESS_PRESCRIPTION,
            actual: MISSING_HARNESS_ACTUAL,
            fix: HARNESS_PRESCRIPTION,
          },
        })
      },
    }
  },
})
