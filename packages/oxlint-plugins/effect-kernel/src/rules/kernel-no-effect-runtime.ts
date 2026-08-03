import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option } from 'effect'
import { BANNED_RUN_CALLS, meta, Options, RUN_CALL_EXPECTED, RUN_CALL_FIX } from './kernel-no-effect-runtime.config.js'

export type MessageIds = 'effectRunCall'

const isKernelFile = (filename: string): boolean => filename.endsWith('.kernel.ts')

type MemberTarget = {
  readonly object: string
  readonly property: string
}

const memberCallTarget = (
  node: ESTree.CallExpression,
): Option.Option<MemberTarget> => {
  if (node.callee.type !== 'MemberExpression') return Option.none()
  const callee = node.callee
  if (callee.computed) return Option.none()
  const property = callee.property.name
  const objectNode = callee.object
  if (objectNode.type !== 'Identifier') return Option.none()
  return Option.some({ object: objectNode.name, property })
}

export const kernelNoEffectRuntime = defineRule({
  meta,
  create(context: Context) {
    if (!isKernelFile(context.filename)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        Option.match(memberCallTarget(node), {
          onNone: () => {},
          onSome: ({ object, property }) => {
            const callName = `${object}.${property}`
            if (!Object.hasOwn(BANNED_RUN_CALLS, callName)) return
            context.report({
              node,
              messageId: 'effectRunCall',
              data: {
                name: callName,
                expected: RUN_CALL_EXPECTED,
                actual: `a call to ${callName}()`,
                fix: RUN_CALL_FIX,
              },
            })
          },
        })
      },
    }
  },
})
