import { krunAsset, MSB_VERSION, msbAsset, msbInstallPaths, type Platform } from '../platform.js'

/**
 * Provisioning environment resolution for the msb backend. Behavioral
 * source: upstream rightsize-node `src/backend-msb/provisioner.ts`
 * `ensureInstalledAt` (Apache-2.0); the shared cache-dir kernel
 * (`src/core/cache-dir.ts` upstream) now lives in the runtime layer
 * (`src/runtime/config.ts` — `resolveCacheDir`), so the runtime never
 * depends on a backend subpath. The decision here is pure: filesystem
 * probes (executability, both files present) are injected by the adapter
 * (U9b); this kernel orders the overrides and derives every path and asset
 * name.
 */

/** The pinned msb release this provisioner installs. */
export const MSB_VERSION_PIN = MSB_VERSION

/** The GitHub release base for the pinned version — the download root for both assets and `checksums.sha256`. */
export function defaultReleaseBase(): string {
  return `https://github.com/superradcompany/microsandbox/releases/download/v${MSB_VERSION}`
}

/** Environment knobs the provisioner honors (subset of `process.env` read by the adapter). */
export interface ProvisionerEnv {
  /** Absolute path to a pre-provisioned msb binary; overrides everything else. */
  readonly MSB_PATH?: string
  /** `"true"` forbids downloading when the pinned install is missing. */
  readonly RIGHTSIZE_MSB_SKIP_DOWNLOAD?: string
}

export type EnvResolution =
  | { readonly _tag: 'use-msb-path'; readonly path: string }
  | { readonly _tag: 'msb-path-unusable'; readonly path: string }
  | { readonly _tag: 'unsupported-platform' }
  | { readonly _tag: 'already-installed'; readonly msbPath: string }
  | { readonly _tag: 'skip-download-missing'; readonly msbPath: string }
  | {
    readonly _tag: 'download'
    readonly installDir: string
    readonly msbPath: string
    readonly krunPath: string
    readonly msbAsset: string
    readonly krunAsset: string
  }

export interface EnvResolutionInput {
  readonly env: ProvisionerEnv
  /** This host's resolved msb platform, or `undefined` when msb ships no build for it. */
  readonly platform: Platform | undefined
  /** The resolved rightsize cache dir (`RIGHTSIZE_CACHE_DIR` or the platform default). */
  readonly cacheDir: string
  /** Injectable "is a usable msb binary at this path" probe (POSIX X_OK vs Windows is-file). */
  readonly isExecutable: (path: string) => boolean
  /** Injectable "both install halves are present" probe for the version-pinned paths. */
  readonly isInstalled: (msbPath: string, krunPath: string) => boolean
}

/**
 * Order of decision (upstream): MSB_PATH short-circuits everything; an
 * unsupported platform fails; an already-complete install is reused; the
 * skip-download flag turns a missing install into a named failure; otherwise a
 * download plan is returned with every asset name and target path derived.
 */
export function envResolution(input: EnvResolutionInput): EnvResolution {
  const override = input.env.MSB_PATH
  if (override !== undefined) {
    return input.isExecutable(override)
      ? { _tag: 'use-msb-path', path: override }
      : { _tag: 'msb-path-unusable', path: override }
  }
  if (input.platform === undefined) {
    return { _tag: 'unsupported-platform' }
  }
  const paths = msbInstallPaths(input.cacheDir, input.platform)
  if (input.isInstalled(paths.msbPath, paths.krunPath)) {
    return { _tag: 'already-installed', msbPath: paths.msbPath }
  }
  if (input.env.RIGHTSIZE_MSB_SKIP_DOWNLOAD === 'true') {
    return { _tag: 'skip-download-missing', msbPath: paths.msbPath }
  }
  return {
    _tag: 'download',
    installDir: paths.installDir,
    msbPath: paths.msbPath,
    krunPath: paths.krunPath,
    msbAsset: msbAsset(input.platform),
    krunAsset: krunAsset(input.platform),
  }
}
