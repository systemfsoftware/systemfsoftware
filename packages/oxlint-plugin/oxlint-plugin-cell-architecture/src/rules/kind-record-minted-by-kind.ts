import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { kindOfFile } from './kind-file.js'
import {
  EXPECTED,
  meta,
  PROTOTYPE_ACTUAL,
  PROTOTYPE_FIX,
  TYPEID_KEY_ACTUAL,
  TYPEID_KEY_FIX,
} from './kind-record-minted-by-kind.config.js'
import { isModuleMember, type ModuleOrigins, moduleOriginsOf, PIPEABLE_MODULE, staticNameOf } from './module-origin.js'
import { symbolBindingNamesOf } from './module-scope.js'

export type MessageIds = 'prototypeSpread' | 'typeIdKey'

const isPrototypeSpread = (argument: ESTree.Node, origins: ModuleOrigins): boolean =>
  isModuleMember(argument, origins, PIPEABLE_MODULE, 'Prototype')

const isTypeIdKey = (key: ESTree.Node, symbolNames: ReadonlySet<string>): boolean => {
  const name = staticNameOf(key)
  if (name !== null && (name === 'TypeId' || symbolNames.has(name))) return true
  return key.type === 'MemberExpression' && staticNameOf(key.property) === 'TypeId'
}

export const kindRecordMintedByKind = defineRule({
  meta,
  create(context: Context) {
    const kind = kindOfFile(context.filename)
    if (kind === null) return {}
    const origins = moduleOriginsOf(context.sourceCode.ast)
    const symbolNames = symbolBindingNamesOf(context.sourceCode.ast)
    return {
      ObjectExpression(node: ESTree.ObjectExpression) {
        for (const property of node.properties) {
          if (property.type === 'SpreadElement') {
            if (isPrototypeSpread(property.argument, origins)) {
              context.report({
                node: property,
                messageId: 'prototypeSpread',
                data: {
                  name: 'a hand-rolled kind record',
                  expected: EXPECTED,
                  actual: PROTOTYPE_ACTUAL,
                  fix: PROTOTYPE_FIX,
                },
              })
            }
            continue
          }
          if (property.computed && isTypeIdKey(property.key, symbolNames)) {
            context.report({
              node: property,
              messageId: 'typeIdKey',
              data: {
                name: 'a hand-rolled kind record',
                expected: EXPECTED,
                actual: TYPEID_KEY_ACTUAL,
                fix: TYPEID_KEY_FIX,
              },
            })
          }
        }
      },
    }
  },
})
