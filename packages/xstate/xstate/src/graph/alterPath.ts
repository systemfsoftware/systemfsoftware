import { XSTATE_INIT } from '../constants.js'
import type { StatePath } from './types.js'

// TODO: rewrite parts of the algorithm leading to this to make this function obsolete
export function alterPath<T extends StatePath<any, any>>(path: T): T {
  let steps: T['steps'] = []

  if (!path.steps.length) {
    steps = [
      {
        state: path.state,
        event: { type: XSTATE_INIT },
      },
    ]
  } else {
    for (let i = 0; i < path.steps.length; i++) {
      const step = path.steps[i]
      if (!step) {
        continue
      }
      const previousStep = i === 0 ? undefined : path.steps[i - 1]

      steps.push({
        state: step.state,
        event: previousStep ? previousStep.event : { type: XSTATE_INIT },
      })
    }
    const lastStep = path.steps[path.steps.length - 1]
    if (lastStep) {
      steps.push({
        state: path.state,
        event: lastStep.event,
      })
    }
  }
  return {
    ...path,
    steps,
  }
}
