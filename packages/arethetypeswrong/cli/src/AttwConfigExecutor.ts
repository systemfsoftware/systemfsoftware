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

/**
 * The file's keys are read exactly as written. `constantCase` used to wrap this
 * provider, which rewrites the *lookup path* into `SCREAMING_SNAKE_CASE` to
 * bridge camelCase names to environment variables — so every camelCase key in a
 * `.attw.json` became unreachable, and the file was parsed and then ignored.
 *
 * `layerAdd` rather than `layer`, because `layer` replaces the provider
 * outright: the file would have silenced environment configuration instead of
 * supplying defaults beneath it.
 */
export const AttwConfigFileLayer: Layer.Layer<never, never, never> = ConfigProvider.layerAdd(
  configProviderEffect,
)
