import { declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { ancestorsOf, type IgnorerPath } from '../ancestor-path.kernel.js'
import { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE } from './make-boundary-ignore.kernel.js'

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'workflow-make-boundary', {
    shouldIgnore(path: IgnorerPath): string | undefined {
      return decideWorkflowMakeBoundaryIgnore(path.node, [...ancestorsOf(path)])
    },
  }),
]

// Public-surface decision: tests reach the decision function through the
// barrel rather than deep-importing the .kernel.ts cell.
export { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE }
