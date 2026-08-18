import { ConfigProvider, Effect, Layer } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Read `.attw.json` if the working directory has one. A missing or malformed
 * file is not an error: the CLI's flags are the source of truth and the file
 * only supplies defaults, so an unreadable candidate is skipped.
 */
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
