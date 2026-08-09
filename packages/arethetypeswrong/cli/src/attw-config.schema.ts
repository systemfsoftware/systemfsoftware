import { ConfigProvider, Effect, Layer } from 'effect'
import { Schema } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const AttwConfigSchema = Schema.Struct({
  ignoreRules: Schema.optional(Schema.Array(Schema.String)),
  ignoreResolutions: Schema.optional(Schema.Array(Schema.Literal('node10', 'node16-cjs', 'node16-esm', 'bundler'))),
  format: Schema.optional(Schema.Literal('auto', 'table', 'table-flipped', 'ascii', 'json')),
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
  profile: Schema.optional(Schema.Literal('strict', 'node16', 'esm-only')),
})
export type AttwConfig = Schema.Schema.Type<typeof AttwConfigSchema>

const readAttwConfigJson = async (): Promise<unknown | null> => {
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
    if (json === null) return ConfigProvider.fromJson({})
    return ConfigProvider.fromJson(json)
  },
)

export const AttwConfigFileLayer: Layer.Layer<never, never, never> = Layer.unwrapEffect(
  Effect.map(configProviderEffect, (provider) => Layer.setConfigProvider(provider.pipe(ConfigProvider.constantCase))),
) as Layer.Layer<never, never, never>

export const _internal = { readAttwConfigJson }
