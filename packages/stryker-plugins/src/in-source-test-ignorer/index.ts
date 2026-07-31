import { declareValuePlugin, PluginKind } from '@stryker-mutator/api/plugin'
import { decideInSourceTestIgnore } from './in-source-test-ignore.js'

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
