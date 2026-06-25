import { declareValuePlugin, PluginKind } from '@stryker-mutator/api/plugin'
import { decideSchemaDeclarationIgnore } from './schema-declaration-ignore.js'

interface IgnorerPath {
  readonly node: unknown
  readonly parentPath?: IgnorerPath | null
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'effect-schema-declarations', {
    shouldIgnore(path: IgnorerPath): string | undefined {
      return decideSchemaDeclarationIgnore(path.node, path.parentPath?.node)
    },
  }),
]
