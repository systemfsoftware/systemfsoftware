import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './handler-no-switch.config.js'

export type MessageIds = 'switchStatement'

const isHandlerFile = (filename: string): boolean => filename.endsWith('.handler.ts')

export const handlerNoSwitch = defineRule({
  meta,
  create(context: Context) {
    if (!isHandlerFile(context.filename)) return {}

    return {
      SwitchStatement(node: ESTree.SwitchStatement) {
        context.report({
          node,
          messageId: 'switchStatement',
          data: {
            name: 'switch',
            expected: 'a Match.tag dispatch closed by Match.orElse(() => 500)',
            actual: 'a switch statement',
            fix:
              'map each typed error variant to its status with Match.type(...).pipe(Match.tag(...), ..., Match.orElse(() => 500)) so a new variant degrades to 500 instead of falling through silently',
          },
        })
      },
    }
  },
})
