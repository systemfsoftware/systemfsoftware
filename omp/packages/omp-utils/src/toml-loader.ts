/**
 * `systemfsoftware.toml` loader — unified config for all systemfsoftware OMP extensions.
 *
 * Parsed with @std/toml. Cached per cwd. Missing file → `{}` (no config is fine).
 * Malformed TOML → fail open (`{}`) + one warn via the injected logger (never throws:
 * a config typo must not freeze extension behavior).
 */

import { parse } from '@std/toml'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONFIG_FILE = 'systemfsoftware.toml'

export interface TomlConfig {
  readonly [key: string]: readonly string[]
}

type WarnFn = (message: string) => void

const cache = new Map<string, TomlConfig>()
const warnedFiles = new Set<string>()

/** Test hook: drop all cached configs and warn dedupe. */
export function resetTomlCache(): void {
  cache.clear()
  warnedFiles.clear()
}

/**
 * Load `systemfsoftware.toml` from `cwd`. Cached per cwd.
 * `warn` receives at most one message per malformed file (defaults to a no-op).
 */
export function loadToml(cwd: string, warn: WarnFn = () => {}): TomlConfig {
  const cached = cache.get(cwd)
  if (cached !== undefined) return cached

  const configPath = join(cwd, CONFIG_FILE)
  let config: TomlConfig = {}
  if (existsSync(configPath)) {
    try {
      const parsed: unknown = parse(readFileSync(configPath, 'utf-8'))
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        config = Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [],
          ]),
        )
      }
    } catch (error) {
      if (!warnedFiles.has(configPath)) {
        warnedFiles.add(configPath)
        warn(`[toml-loader] malformed ${CONFIG_FILE} at ${configPath} — failing open (no config)`)
        warn(error instanceof Error ? error.message : 'unknown parse error')
      }
    }
  }

  cache.set(cwd, config)
  return config
}
