import { ConfigProvider, Effect, Layer } from 'effect'
import { Schema } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const AttwConfigSchema = Schema.Struct({
  ignoreRules: Schema.optional(Schema.Array(Schema.String)),
  ignoreResolutions: Schema.optional(
    Schema.Array(Schema.Literals(['node10', 'node16-cjs', 'node16-esm', 'bundler'])),
  ),
  format: Schema.optional(Schema.Literals(['auto', 'table', 'table-flipped', 'ascii', 'json'])),
  quiet: Schema.optional(Schema.Boolean),
  summary: Schema.optional(Schema.Boolean),
  emoji: Schema.optional(Schema.Boolean),
  color: Schema.optional(Schema.Boolean),
  entrypoints: Schema.optional(Schema.Array(Schema.String)),
  includeEntrypoints: Schema.optional(Schema.Array(Schema.String)),
  excludeEntrypoints: Schema.optional(Schema.Array(Schema.String)),
  entrypointsLegacy: Schema.optional(Schema.Boolean),
  fromNpm: Schema.optional(Schema.Boolean),
  pack: Schema.optional(Schema.Boolean),
  registry: Schema.optional(Schema.String),
})
export type AttwConfig = Schema.Schema.Type<typeof AttwConfigSchema>

const readAttwConfigJson = async (): Promise<unknown> => {
  const cwd = process.cwd()
  for (const candidate of ['.attw.json', path.join(cwd, '.attw.json')]) {
    try {
      const buf = await fs.readFile(candidate, 'utf8')
      return JSON.parse(buf)
    } catch {
      continue
    }
  }
  return null
}

const configProviderEffect: Effect.Effect<ConfigProvider.ConfigProvider, never, never> = Effect.promise(
  async () => {
    const json = await readAttwConfigJson()
    if (json === null) return ConfigProvider.fromUnknown({})
    return ConfigProvider.fromUnknown(json)
  },
)

export const AttwConfigFileLayer: Layer.Layer<never, never, never> = ConfigProvider.layer(
  Effect.map(configProviderEffect, (provider) => ConfigProvider.constantCase(provider)),
)

export const _internal = { readAttwConfigJson }
