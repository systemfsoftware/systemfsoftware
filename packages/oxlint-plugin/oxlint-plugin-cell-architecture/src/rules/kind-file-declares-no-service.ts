import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { actualOf, EXPECTED, FIX, meta } from './kind-file-declares-no-service.config.js'
import { kindOfFile } from './kind-file.js'
import {
  calleeRootOf,
  EFFECT_CONTEXT_MODULE,
  EFFECT_SOURCE,
  memberPathOf,
  type ModuleOrigins,
  moduleOriginsOf,
  originOf,
  staticNameOf,
} from './module-origin.js'
const SERVICE_MEMBERS: Readonly<Record<string, true>> = {
  Service: true,
  Tag: true,
  Key: true,
}

const isContextConstructor = (node: ESTree.Node, origins: ModuleOrigins): boolean => {
  const call = node.type === 'CallExpression' ? node : null
  if (call === null) return false
  const origin = originOf(calleeRootOf(call.callee), origins)
  if (origin === null) return false
  const path = memberPathOf(origin)
  if (origin.source === EFFECT_CONTEXT_MODULE) return SERVICE_MEMBERS[path] === true
  if (origin.source !== EFFECT_SOURCE) return false
  return (
    SERVICE_MEMBERS[path] === true ||
    (path.startsWith('Context.') && SERVICE_MEMBERS[path.slice('Context.'.length)] === true)
  )
}

const classNameOf = (node: ESTree.Class): string => (node.id === null ? '<anonymous>' : node.id.name)

const declarationNameOf = (declarator: ESTree.VariableDeclarator): string =>
  staticNameOf(declarator.id) ?? '<pattern binding>'

const report = (context: Context, node: ESTree.Node, name: string, declarationKind: string): void => {
  context.report({
    node,
    messageId: 'serviceDeclaration',
    data: { name, expected: EXPECTED, actual: actualOf(declarationKind, name), fix: FIX },
  })
}

export const kindFileDeclaresNoService = defineRule({
  meta,
  create(context: Context) {
    const kind = kindOfFile(context.filename)
    if (kind === null) return {}
    const origins = moduleOriginsOf(context.sourceCode.ast)
    return {
      ClassDeclaration(node: ESTree.Class) {
        const superClass = node.superClass
        if (superClass === null || !isContextConstructor(superClass, origins)) return
        const name = classNameOf(node)
        report(context, node, name, 'Context.Service class')
      },
      ClassExpression(node: ESTree.Class) {
        const superClass = node.superClass
        if (superClass === null || !isContextConstructor(superClass, origins)) return
        const name = classNameOf(node)
        report(context, node, name, 'Context.Service class')
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        const init = node.init
        if (init === null || !isContextConstructor(init, origins)) return
        const name = declarationNameOf(node)
        report(context, node, name, 'context identity')
      },
    }
  },
})
