import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { moduleScopeStatePrimitives } from './state-primitives.js'
import { meta } from './state-quarantine-holds-state.config.js'

export type MessageIds = 'noStatePrimitive'

const NO_STATE_PRIMITIVE_MESSAGE_ID: MessageIds = 'noStatePrimitive'

const isStateFile = (filename: string): boolean => filename.endsWith('.state.ts')

export const stateQuarantineHoldsState = defineRule({
  meta,
  create(context: Context) {
    if (!isStateFile(context.filename)) return {}

    return {
      'Program:exit'(node: ESTree.Program) {
        if (moduleScopeStatePrimitives(node).length === 0) {
          context.report({
            node,
            messageId: NO_STATE_PRIMITIVE_MESSAGE_ID,
            data: {
              name: 'state cell',
              expected:
                'at least one module-scope construction of an escaping coordination primitive (new Map/Set/WeakMap/WeakSet/Semaphore, Ref.unsafeMake, Deferred.unsafeMake, Semaphore.make, TRef.unsafeMake, ManagedRuntime.make, Layer.toRuntime, or a class extending Context.Reference)',
              actual: 'no escaping live state at module scope',
              fix:
                'construct the escaping Map/Ref/Deferred/Semaphore/Runtime at module scope in this *.state.ts, or move the file to the cell that owns its actual content',
            },
          })
        }
      },
    }
  },
})
