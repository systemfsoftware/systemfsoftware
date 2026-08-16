import { declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { decideWorkflowMakeBoundaryIgnore, NOT_INSIDE_WORKFLOW_MAKE } from './make-boundary-ignore.kernel.js'

interface IgnorerPath {
  readonly node: unknown
  readonly parentPath?: IgnorerPath | null
}

function* ancestorsOf(path: IgnorerPath): Generator<unknown> {
  for (let current = path.parentPath; current; current = current.parentPath) {
    yield current.node
  }
}

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
