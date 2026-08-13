import { pipeArguments } from 'effect/Pipeable'

/** @internal */
export const PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments)
  },
}
