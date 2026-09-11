import type { IgnorerFactory } from '@systemfsoftware/stryker-js/Ignorer'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { ancestorsOf } from '../AncestorPath.js'
import { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE } from './MakeBoundaryIgnore.js'

const makeIgnorer: IgnorerFactory = () => (path) =>
  decideWorkflowMakeBoundaryIgnore(path.node, [...ancestorsOf(path)]) ?? null

export const strykerPlugins = [
  declarePlugin('Ignorer', 'workflow-make-boundary', makeIgnorer),
]

// Public-surface decision: tests reach the decision function through the barrel.
export { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE }
