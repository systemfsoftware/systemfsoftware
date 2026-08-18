import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  meta,
  NO_PRIVATE_TARGET_ACTUAL,
  NO_PRIVATE_TARGET_EXPECTED,
  NO_PRIVATE_TARGET_FIX,
  NO_PRIVATE_TARGET_NAME,
  NOT_MODULE_LEVEL_ACTUAL,
  NOT_MODULE_LEVEL_EXPECTED,
  NOT_MODULE_LEVEL_FIX,
  NOT_MODULE_LEVEL_NAME,
} from './in-source-test-targets-private.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'

export type MessageIds = 'notModuleLevel' | 'noPrivateTarget'

export const isMetaVitest = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest' &&
  node.object.type === 'MetaProperty'

export const isVitestGuard = (test: ESTree.Node): boolean => {
  if (isMetaVitest(test)) return true
  if (test.type !== 'BinaryExpression') return false
  return isMetaVitest(test.left) || isMetaVitest(test.right)
}

type CollectableNode =
  | ESTree.VariableDeclaration
  | ESTree.Function
  | ESTree.Class
  | ESTree.TSEnumDeclaration

const isCollectable = (node: ESTree.Node): node is CollectableNode =>
  node.type === 'VariableDeclaration' ||
  node.type === 'FunctionDeclaration' ||
  node.type === 'ClassDeclaration' ||
  node.type === 'TSEnumDeclaration'

const addPrivateName = (id: ESTree.Node, out: Set<string>): void => {
  if (id.type === 'Identifier') out.add(id.name)
}

const LocalBinding = S.Struct({ name: S.String })

const collectDeclaration = (node: CollectableNode, out: Set<string>): void => {
  if (node.type === 'VariableDeclaration') {
    for (const declarator of node.declarations) addPrivateName(declarator.id, out)
    return
  }
  if (node.id !== null) addPrivateName(node.id, out)
}

const collectPrivateNames = (
  body: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  out: Set<string>,
): void => {
  for (const node of body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.source !== null) continue
      for (const specifier of node.specifiers) {
        out.delete(S.decodeUnknownSync(LocalBinding)(specifier.local).name)
      }
      continue
    }
    if (isCollectable(node)) collectDeclaration(node, out)
  }
}

type GuardRecord = { node: ESTree.IfStatement; hit: boolean }

const isInsideConsequent = (
  identifier: ESTree.IdentifierReference,
  consequent: ESTree.Node,
): boolean => {
  const walk = (current: ESTree.Node | null): boolean => {
    if (current === null) return false
    if (current === consequent) return true
    return walk(current.parent)
  }
  return walk(identifier.parent)
}

export const inSourceTestTargetsPrivate = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const basename = basenameOf(filename)
    const underSrc = isUnderSrc(filename)
    const inTestFile = isTestFile(basename)
    if (!underSrc || inTestFile) return {}
    const privateNames = new Set<string>()
    const guards: GuardRecord[] = []

    return {
      Program(node: ESTree.Program) {
        collectPrivateNames(node.body, privateNames)
      },
      IfStatement(node: ESTree.IfStatement) {
        if (!isVitestGuard(node.test)) return
        if (node.parent.type !== 'Program') {
          context.report({
            node: node.test,
            messageId: 'notModuleLevel',
            data: {
              name: NOT_MODULE_LEVEL_NAME,
              expected: NOT_MODULE_LEVEL_EXPECTED,
              actual: NOT_MODULE_LEVEL_ACTUAL,
              fix: NOT_MODULE_LEVEL_FIX,
            },
          })
          return
        }
        guards.push({
          node,
          hit: false,
        })
      },
      Identifier(node: ESTree.IdentifierReference) {
        if (!privateNames.has(node.name)) return
        const guard = guards.find((g) => isInsideConsequent(node, g.node.consequent))
        if (guard !== undefined) guard.hit = true
      },
      'Program:exit'() {
        for (const guard of guards) {
          if (guard.hit) continue
          context.report({
            node: guard.node.test,
            messageId: 'noPrivateTarget',
            data: {
              name: NO_PRIVATE_TARGET_NAME,
              expected: NO_PRIVATE_TARGET_EXPECTED,
              actual: NO_PRIVATE_TARGET_ACTUAL,
              fix: NO_PRIVATE_TARGET_FIX,
            },
          })
        }
      },
    }
  },
})
