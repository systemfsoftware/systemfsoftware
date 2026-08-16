import { declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { ancestorsOf, type IgnorerPath } from '../ancestor-path.kernel.js'
import {
  decideInSourceTestIgnore,
  IN_SOURCE_TEST_IGNORED,
  isInSourceTestGuard,
} from './in-source-test-ignore.kernel.js'

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
