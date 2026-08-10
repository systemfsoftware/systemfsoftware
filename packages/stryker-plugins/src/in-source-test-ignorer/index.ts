import { declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import {
  decideInSourceTestIgnore,
  IN_SOURCE_TEST_IGNORED,
  isInSourceTestGuard,
} from './in-source-test-ignore.kernel.js'

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
  declareValuePlugin(PluginKind.Ignore, 'in-source-vitest-block', {
    shouldIgnore(path: IgnorerPath): string | undefined {
      return decideInSourceTestIgnore(ancestorsOf(path))
    },
  }),
]

// Public-surface decision: tests reach the decision function through the
// barrel rather than deep-importing the .kernel.ts cell.
export { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard }
