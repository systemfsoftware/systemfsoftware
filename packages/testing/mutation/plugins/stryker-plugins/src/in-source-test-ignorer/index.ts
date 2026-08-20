import { declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { ancestorsOf, type IgnorerPath } from '../AncestorPath.js'
import { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard } from './InSourceTestIgnore.js'

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'in-source-vitest-block', {
    shouldIgnore(path: IgnorerPath): string | undefined {
      return decideInSourceTestIgnore(ancestorsOf(path))
    },
  }),
]

// Public-surface decision: tests reach the decision function through the
// barrel rather than deep-importing the .kernel.ts cell.
export { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard }
