import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { effectMemberIs } from './effect-origin.js'
import { actualOf, EXPECTED, FIX, meta } from './kind-file-declares-no-service.config.js'
import { basenameOf, isHandleFile, isResourceFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'serviceDeclaration'

/** Every `Context.Service`-shaped export of effect v4 (Context.ts); no other effect namespace exports `Service`. */
const SERVICE_MEMBERS: Readonly<Record<string, true>> = { Service: true }

const serviceConstructorOf = (node: ESTree.Node, getScope: (node: ESTree.Node) => unknown): boolean => {
  if (node.type === 'CallExpression') return serviceConstructorOf(node.callee, getScope)
  return effectMemberIs(node, getScope, SERVICE_MEMBERS)
}

const classNameOf = (node: ESTree.Class): string => (node.id === null ? 'anonymous class' : node.id.name)

export const kindFileDeclaresNoService = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename)) return {}
    const basename = basenameOf(context.filename)
    if (isResourceFile(basename) === false && isHandleFile(basename) === false) return {}
    const getScope = context.sourceCode.getScope
    return {
      ClassDeclaration(node: ESTree.Class) {
        if (node.superClass === null) return
        if (serviceConstructorOf(node.superClass, getScope) === false) return
        context.report({
          node,
          messageId: 'serviceDeclaration',
          data: { name: classNameOf(node), expected: EXPECTED, actual: actualOf(classNameOf(node)), fix: FIX },
        })
      },
      ClassExpression(node: ESTree.Class) {
        if (node.superClass === null) return
        if (serviceConstructorOf(node.superClass, getScope) === false) return
        context.report({
          node,
          messageId: 'serviceDeclaration',
          data: { name: classNameOf(node), expected: EXPECTED, actual: actualOf(classNameOf(node)), fix: FIX },
        })
      },
    }
  },
})
