import { declareValuePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { decideSchemaDeclarationIgnore } from './schema-declaration-ignore.kernel.js'

interface IgnorerPath {
  readonly node: unknown
  readonly parentPath?: IgnorerPath | null
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'effect-schema-declarations', {
    shouldIgnore(path: IgnorerPath): string | undefined {
      const parent = path.parentPath
      const grandparent = parent?.parentPath
      return decideSchemaDeclarationIgnore(path.node, parent?.node, grandparent?.node, grandparent?.parentPath?.node)
    },
  }),
]
