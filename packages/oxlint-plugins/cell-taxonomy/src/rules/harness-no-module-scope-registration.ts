import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { ACTUAL, EXPECTED, FIX, HARNESS_FILE, meta } from './harness-no-module-scope-registration.config.js'

export type MessageIds = 'moduleScopeRegistration'

const Options = S.Struct({
  callees: S.Array(S.NonEmptyString),
})

const decodeOptions = S.decodeUnknownSync(Options)

const dottedPathOf = (callee: ESTree.Expression): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    const object = dottedPathOf(callee.object)
    if (object === null) return null
    return `${object}.${callee.property.name}`
  }
  return null
}

const isRegistrationCallee = (callee: string, callees: ReadonlyArray<string>): boolean =>
  callees.some((name) => callee === name || callee.startsWith(`${name}.`))

const isImportMetaVitest = (node: ESTree.Expression): boolean =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'MetaProperty' &&
  node.object.meta.name === 'import' &&
  node.object.property.name === 'meta' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest'

const referencesImportMetaVitest = (node: ESTree.Expression | ESTree.PrivateIdentifier): boolean => {
  if (node.type === 'PrivateIdentifier') return false
  if (isImportMetaVitest(node)) return true
  switch (node.type) {
    case 'BinaryExpression':
    case 'LogicalExpression':
      return referencesImportMetaVitest(node.left) || referencesImportMetaVitest(node.right)
    case 'UnaryExpression':
      return referencesImportMetaVitest(node.argument)
    case 'ParenthesizedExpression':
      return referencesImportMetaVitest(node.expression)
    default:
      return false
  }
}

export const harnessNoModuleScopeRegistration = defineRule({
  meta,
  create(context: Context) {
    if (!HARNESS_FILE.test(context.filename)) return {}

    const { callees } = decodeOptions(context.options[0])

    let functionDepth = 0
    let inSourceTestBlockDepth = 0

    return {
      FunctionDeclaration() {
        functionDepth += 1
      },
      'FunctionDeclaration:exit'() {
        functionDepth -= 1
      },
      FunctionExpression() {
        functionDepth += 1
      },
      'FunctionExpression:exit'() {
        functionDepth -= 1
      },
      ArrowFunctionExpression() {
        functionDepth += 1
      },
      'ArrowFunctionExpression:exit'() {
        functionDepth -= 1
      },
      IfStatement(node: ESTree.IfStatement) {
        if (referencesImportMetaVitest(node.test)) inSourceTestBlockDepth += 1
      },
      'IfStatement:exit'(node: ESTree.IfStatement) {
        if (referencesImportMetaVitest(node.test)) inSourceTestBlockDepth -= 1
      },
      CallExpression(node: ESTree.CallExpression) {
        if (functionDepth > 0) return
        if (inSourceTestBlockDepth > 0) return

        const callee = dottedPathOf(node.callee)
        if (callee === null) return
        if (!isRegistrationCallee(callee, callees)) return

        context.report({
          node,
          messageId: 'moduleScopeRegistration',
          data: {
            name: callee,
            expected: EXPECTED,
            actual: ACTUAL,
            fix: FIX,
          },
        })
      },
    }
  },
})
