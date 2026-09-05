import { Ignorer } from '@systemfsoftware/stryker-js/Ignorer'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { ancestorsOf, type IgnorerPath } from '../AncestorPath.js'
import { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE } from './MakeBoundaryIgnore.js'

export const strykerPlugins = [
  declarePlugin(
    'Ignore',
    'workflow-make-boundary',
    Layer.succeed(Ignorer, {
      shouldIgnore: (path: IgnorerPath) =>
        Option.fromUndefinedOr(decideWorkflowMakeBoundaryIgnore(path.node, [...ancestorsOf(path)])),
    }),
  ),
]

// Public-surface decision: tests reach the decision function through the
// barrel rather than deep-importing the .kernel.ts cell.
export { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE }
