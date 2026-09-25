import { Array as Arr } from 'effect'
import type { SupervisionPolicy } from './SupervisorPolicy.schema.js'
import type { SupervisorCore } from './SupervisorState.schema.js'
export const initialStateOf = (policy: SupervisionPolicy): SupervisorCore => ({
  policy,
  children: Arr.map(policy.childDeclarations, (declaration) => ({
    childId: declaration.childId,
    generation: 0,
    status: 'starting',
    consecutiveRestarts: 0,
    probeFailures: 0,
  })),
  restartStamps: [],
  nextOrdinal: 0,
})
