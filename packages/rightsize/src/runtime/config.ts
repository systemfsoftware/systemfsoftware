/**
 * Rightsize runtime configuration — the `RIGHTSIZE_*` environment surface
 * read through Effect `Config` (testable layers), per the plan's assumption
 * that env names are preserved verbatim for drop-in familiarity but never
 * read as scattered `process.env` accesses in source.
 *
 * `config` is the `Config.Config` descriptor (composable, testable via a
 * `ConfigProvider`); `layer` is the ready service. `RIGHTSIZE_BACKEND`
 * matches case-insensitively (upstream `Backends.resolve` lowercases the
 * requested name) and accepts upstream's historical provider name
 * `microsandbox` as an alias for `msb` — the value an existing deployment
 * has in its environment must keep meaning the same thing after the swap.
 */
import * as os from 'node:os'

import { Config, Context, Layer, Option, Schema as S } from 'effect'

import { resolveCacheDir } from '../backend-msb/provisioner/env.js'

/** What `RIGHTSIZE_BACKEND` may say: an explicit backend, or `auto`. */
export type BackendPreference = 'auto' | 'docker' | 'msb'

/** The reaper modes `RIGHTSIZE_REAPER` may say (R6's sweep posture). */
export type ReaperMode = 'on' | 'sweep' | 'off'

/** The complete declared configuration surface this unit owns. */
export interface RightsizeConfigService {
  /** `RIGHTSIZE_BACKEND` — `auto`, `docker`, or `msb` (upstream's `microsandbox` is accepted); default `auto`. */
  readonly backend: BackendPreference
  /** `RIGHTSIZE_REAPER` — `on` | `sweep` | `off`; default `on`. */
  readonly reaper: ReaperMode
  /** `RIGHTSIZE_CACHE_DIR` — the cache-dir override; `undefined` when unset (the platform default is derived by the units that need it). */
  readonly cacheDir: string | undefined
  /** `RIGHTSIZE_REUSE` — reuse opt-in marker; `false` when unset. */
  readonly reuse: boolean
  /** `MSB_PATH` — a pre-installed msb binary; `undefined` when unset (the provisioner downloads then). */
  readonly msbPath: string | undefined
  /** `RIGHTSIZE_MSB_SKIP_DOWNLOAD` — refuse to download the toolchain; default `false`. */
  readonly msbSkipDownload: boolean
}

/**
 * The configuration service Tag, in the house class form (the AnthropicClient
 * pattern; the repository's `ban-classes` gate whitelists these names in this
 * package's oxlint config, per the effect-daemon-spec precedent set during
 * the v4 migration).
 */
export class RightsizeConfig extends Context.Service<RightsizeConfig, RightsizeConfigService>()(
  '@systemfsoftware/rightsize/runtime/config/RightsizeConfig',
) {}

/**
 * The rightsize cache dir resolved from the config service — the ONE cache
 * derivation every unit that needs a place on disk shares (launch hygiene,
 * the reaping ledger, the fleet's by-id driver, the reuse and checkpoint
 * registries, the msb provisioner). `resolveCacheDir` owns the platform
 * default (`%LOCALAPPDATA%` on Windows, `~/.cache` elsewhere); this is the
 * config-shaped entry point.
 */
export const cacheDirFromConfig = (config: RightsizeConfigService): string =>
  resolveCacheDir({
    rightsizeCacheDir: config.cacheDir,
    platform: process.platform,
    homedir: os.homedir(),
    localAppData: process.env['LOCALAPPDATA'],
  })

/** A backend name as the config may spell it, case-insensitively. */
const KnownBackendName = S.refine<typeof S.String, string>(
  (value: string): value is string => {
    const normalized = value.trim().toLowerCase()
    return normalized === 'auto' || normalized === 'docker' || normalized === 'msb' || normalized === 'microsandbox'
  },
  {
    identifier: 'KnownBackendName',
    title: 'KnownBackendName',
    message: "expected one of 'auto' | 'docker' | 'msb' | 'microsandbox'",
  },
)(S.String)

/** A reaper mode as `RIGHTSIZE_REAPER` may spell it. */
const ReaperModeName = S.refine<typeof S.String, ReaperMode>(
  (value: string): value is ReaperMode => value === 'on' || value === 'sweep' || value === 'off',
  {
    identifier: 'ReaperModeName',
    title: 'ReaperModeName',
    message: "expected one of 'on' | 'sweep' | 'off'",
  },
)(S.String)

/** The normalized + aliased backend preference. */
const backend: Config.Config<BackendPreference> = Config.map(
  Config.withDefault(Config.schema(KnownBackendName, 'RIGHTSIZE_BACKEND'), 'auto'),
  (raw): BackendPreference => {
    // The refinement above only admits the four names (case-insensitively);
    // the default arm is unreachable and exists to satisfy exhaustiveness.
    switch (raw.trim().toLowerCase()) {
      case 'auto':
        return 'auto'
      case 'docker':
        return 'docker'
      case 'msb':
        return 'msb'
      case 'microsandbox':
        return 'msb'
      default:
        throw new Error(`unreachable backend name admitted by KnownBackendName: '${raw}'`)
    }
  },
)

const reaper: Config.Config<ReaperMode> = Config.withDefault(Config.schema(ReaperModeName, 'RIGHTSIZE_REAPER'), 'on')

/** `RIGHTSIZE_CACHE_DIR`: the raw override; `undefined` when unset. */
const cacheDir: Config.Config<string | undefined> = Config.option(Config.string('RIGHTSIZE_CACHE_DIR')).pipe(
  Config.map((value) => (Option.isSome(value) ? value.value : undefined)),
)

/** `RIGHTSIZE_REUSE`: opt-in marker; `false` when unset. */
const reuse: Config.Config<boolean> = Config.boolean('RIGHTSIZE_REUSE').pipe(Config.withDefault(false))

/** `MSB_PATH`: a pre-installed binary override; `undefined` when unset. */
const msbPath: Config.Config<string | undefined> = Config.option(Config.string('MSB_PATH')).pipe(
  Config.map((value) => (Option.isSome(value) ? value.value : undefined)),
)

/** `RIGHTSIZE_MSB_SKIP_DOWNLOAD`: refuse the toolchain download; default `false`. */
const msbSkipDownload: Config.Config<boolean> = Config.boolean('RIGHTSIZE_MSB_SKIP_DOWNLOAD').pipe(
  Config.withDefault(false),
)

/** The composable config descriptor for every `RIGHTSIZE_*` field. */
export const config: Config.Config<RightsizeConfigService> = Config.all({
  backend,
  reaper,
  cacheDir,
  reuse,
  msbPath,
  msbSkipDownload,
})

/** The service layer: evaluate the descriptor under the ambient `ConfigProvider` (env by default). */
export const layer = Layer.effect(RightsizeConfig, Config.unwrap(config))
