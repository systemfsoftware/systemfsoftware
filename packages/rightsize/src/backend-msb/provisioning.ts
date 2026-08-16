/**
 * The msb toolchain provisioner adapter — the effectful half of getting a
 * runnable, verified `msb` binary in place. The DECISIONS all live in the
 * landed kernels (U9a): `envResolution` orders the environment overrides,
 * `installPlan` orders the download-verify-rename steps (krun before the
 * msb binary — msb's presence is the commit marker, so a crash can never
 * leave a present-msb/missing-krun install), `verifyPlan` checks each
 * downloaded asset against the release manifest, and `lockStaleness`
 * arbitrates the cross-process install lock. This module executes those
 * decisions as effects:
 *
 * - the filesystem probes (executability, both install halves present,
 *   `/dev/kvm`) are sync predicates, so the resolution paths are
 *   deterministically testable;
 * - the release downloads are an injectable `fetchBytes` seam (default:
 *   node https with bounded redirects and a per-request timeout);
 * - the install lock is a real `O_EXCL`-create lock file recording
 *   `${pid}\n${timestamp}`, with stale-holder takeover driven by the
 *   `lockStaleness` kernel on every EEXIST and a fresh-holder poll budget;
 * - the failed paths all produce the typed `ProvisionError`: unusable
 *   `MSB_PATH`, unsupported platform, skip-download with nothing installed,
 *   checksum mismatch, malformed manifest, lock wait exhaustion. A failed
 *   download leaves no half-install (both assets verify before either
 *   rename) and its temp files are best-effort removed.
 *
 * The outcome is the provisioned binary path, exposed as the
 * `ProvisionedMsb` service the command-runner layer builds its live runner
 * over. The layer is memoized by Layer composition: every adapter method
 * that awaits it on first use pays the provisioning cost exactly once.
 */
import { existsSync } from 'node:fs'
import { accessSync, constants as fsConstants, statSync } from 'node:fs'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import * as https from 'node:https'
import * as os from 'node:os'
import { dirname, join } from 'node:path'

import { Effect, Exit, Match, Option, Schema as S } from 'effect'

import { ProvisionError } from '../model/errors.js'
import { RightsizeConfig } from '../runtime/config.js'
import { MSB_VERSION, type MsbInstallPaths, msbInstallPaths, type Platform, platformFor } from './platform.js'
import { parseChecksums, type VerifyOutcome, verifyPlan } from './provisioner/checksum.js'
import { defaultReleaseBase, type EnvResolution, envResolution, resolveCacheDir } from './provisioner/env.js'
import {
  type InstallArtifact,
  installPlan,
  type InstallStep,
  isInstalled,
  type RenameStep,
} from './provisioner/install.js'
import { lockStaleness } from './provisioner/lock.js'

/** The provisioned msb binary path — the single value every adapter needs before it can run anything. */
export interface ProvisionedMsbService {
  readonly msbPath: string
}

/** A `ProvisionError` value — never a throw. */
export function provisionFailure(message: string): ProvisionError {
  return ProvisionError.make({ message })
}

/** Renders any thrown value into a message string without destroying the error's own identity. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    const repr = JSON.stringify(error)
    return repr === undefined ? '<unknown error>' : repr
  } catch {
    return '<unserializable error>'
  }
}

/** `NodeJS.ErrnoException`-style `code` reader without an unsafe type assertion. */
function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  const code: unknown = error.code
  return typeof code === 'string' ? code : undefined
}

// ---------------------------------------------------------------------------
// Defaults (upstream values) + injectable knobs
// ---------------------------------------------------------------------------

/** Ceiling on one release fetch (a cold pull of the msb binary can be slow). */
export const DEFAULT_FETCH_TIMEOUT_MS = 300_000

/** How long a waiter tolerates a held, fresh install lock before giving up. */
export const LOCK_WAIT_MAX_MS = 30_000

/** The pause between install-lock polls. */
export const LOCK_POLL_MS = 200

/** The provisioner knobs tests inject; every default is the upstream value. */
export interface ProvisionerOptions {
  /** The GitHub release base URL (default: the pinned release). */
  readonly baseUrl?: string | undefined
  /** The effectful downloader — scripted in tests, real https by default. */
  readonly fetchBytes?: ((url: string) => Effect.Effect<Uint8Array, ProvisionError>) | undefined
  /** The clock supplying "now" to the lock-staleness kernel and wait budgets. */
  readonly now?: (() => number) | undefined
  /** How long a waiter tolerates a fresh lock. Tests shrink this. */
  readonly lockWaitMaxMs?: number | undefined
  readonly lockPollMs?: number | undefined
}

export interface ResolvedProvisionerOptions {
  readonly baseUrl: string
  readonly fetchBytes: (url: string) => Effect.Effect<Uint8Array, ProvisionError>
  readonly now: () => number
  readonly lockWaitMaxMs: number
  readonly lockPollMs: number
  /** `%LOCALAPPDATA%` (Windows default cache root) — read at option-resolve time, never inside Effect code. */
  readonly localAppData: string | undefined
}

/** The defaulted options — the real fetch seam, the live clock, upstream budgets. */
export function resolveProvisionerOptions(options: ProvisionerOptions = {}): ResolvedProvisionerOptions {
  return {
    baseUrl: options.baseUrl ?? defaultReleaseBase(),
    fetchBytes: options.fetchBytes ?? defaultFetchBytes,
    now: options.now ?? Date.now,
    lockWaitMaxMs: options.lockWaitMaxMs ?? LOCK_WAIT_MAX_MS,
    lockPollMs: options.lockPollMs ?? LOCK_POLL_MS,
    localAppData: process.env['LOCALAPPDATA'],
  }
}

// ---------------------------------------------------------------------------
// Probes + default fetch
// ---------------------------------------------------------------------------

/** `true` when `p` is a usable msb binary: POSIX-executable, or an existing regular file on Windows. */
export function isExecutableProbe(p: string): boolean {
  if (process.platform === 'win32') {
    try {
      return statSync(p).isFile()
    } catch {
      return false
    }
  }
  try {
    accessSync(p, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/** The kvm probe: `/dev/kvm` must be openable read+write for krun to launch a microVM. */
export function kvmProbe(): boolean {
  if (process.platform !== 'linux') {
    return true
  }
  try {
    accessSync('/dev/kvm', fsConstants.R_OK | fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

/** Whether the version-pinned install is complete and usable (both halves present). */
export function installedProbe(msbPath: string, krunPath: string): boolean {
  return isInstalled({ msbUsable: isExecutableProbe(msbPath), krunPresent: existsSync(krunPath) })
}

/** `process.kill(pid, 0)` semantics — any errno other than `ESRCH` means a live process. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return errnoCode(err) === 'EPERM'
  }
}

/** Follows a bounded chain of https redirects — the release CDN issues one hop to the actual asset host. */
export function defaultFetchBytes(url: string): Effect.Effect<Uint8Array, ProvisionError> {
  const { promise, resolve, reject } = Promise.withResolvers<Uint8Array>()
  const fetch = (target: string, redirectsLeft: number): void => {
    const req = https.get(target, { timeout: DEFAULT_FETCH_TIMEOUT_MS }, (res) => {
      const status = res.statusCode ?? 0
      const location = res.headers['location']
      if (status >= 300 && status < 400 && location !== undefined) {
        res.resume()
        if (redirectsLeft <= 0) {
          reject(provisionFailure(`too many redirects fetching ${target}`))
          return
        }
        fetch(new URL(location, target).toString(), redirectsLeft - 1)
        return
      }
      if (status !== 200) {
        res.resume()
        reject(provisionFailure(`HTTP ${status} fetching ${target}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', (err) => reject(provisionFailure(`fetching ${target}: ${err.message}`)))
    })
    req.on('timeout', () => req.destroy(provisionFailure(`timed out fetching ${target}`)))
    req.on(
      'error',
      (err) => reject(S.is(ProvisionError)(err) ? err : provisionFailure(`fetching ${target}: ${err.message}`)),
    )
  }
  fetch(url, 5)
  return Effect.tryPromise({ try: () => promise, catch: (error) => provisionFailure(describeError(error)) })
}

// ---------------------------------------------------------------------------
// Install-lock effect
// ---------------------------------------------------------------------------

type LockAttempt =
  | { readonly _tag: 'acquired'; readonly handle: FileHandle }
  | { readonly _tag: 'exists' }
  | { readonly _tag: 'failed'; readonly message: string }

/** One `O_EXCL` create attempt — the kernel decides what a taken seat means; this only reports it. */
function acquireLock(lockPath: string): Effect.Effect<LockAttempt> {
  const { promise, resolve } = Promise.withResolvers<LockAttempt>()
  void open(lockPath, 'wx').then(
    (handle) => resolve({ _tag: 'acquired', handle }),
    (error) => {
      if (errnoCode(error) !== 'EEXIST') {
        resolve({ _tag: 'failed', message: describeError(error) })
        return
      }
      resolve({ _tag: 'exists' })
    },
  )
  return Effect.promise(() => promise)
}

/** Reads a lock file's content; an unreadable lock is treated as empty (and therefore stale by the kernel). */
function readTextOrEmpty(path: string): Effect.Effect<string> {
  const { promise, resolve } = Promise.withResolvers<string>()
  void readFile(path, 'utf8').then(resolve, () => resolve(''))
  return Effect.promise(() => promise)
}

/**
 * The cross-process install lock: a `${pid}\n${timestamp}` file created with
 * `O_EXCL` and removed once the body finishes. Stale holders (unparseable
 * record, provably-dead pid, or aged past the threshold) are taken over per
 * the `lockStaleness` kernel; a fresh holder is polled up to the wait
 * budget. The `body` re-checks installation after acquiring — another
 * process may have finished while this one waited.
 */
export function withInstallLock<T>(
  lockPath: string,
  options: ResolvedProvisionerOptions,
  body: Effect.Effect<T, ProvisionError>,
): Effect.Effect<T, ProvisionError> {
  const start = options.now()
  const loop = (): Effect.Effect<T, ProvisionError> =>
    Effect.gen(function*() {
      const attempt = yield* acquireLock(lockPath)
      const outcome = Match.value(attempt).pipe(
        Match.tag('failed', ({ message }) =>
          Effect.fail(provisionFailure(`failed to acquire the msb install lock at ${lockPath}: ${message}`))),
        Match.tag('acquired', ({ handle }) =>
          Effect.gen(function*() {
            yield* Effect.tryPromise({
              try: () =>
                handle.writeFile(`${process.pid}\n${options.now()}`),
              catch: (error) =>
                provisionFailure(`failed to record the msb install lock at ${lockPath}: ${describeError(error)}`),
            })
            // Capture the body's outcome instead of a try/finally: an
            // Effect.gen's `finally` does NOT run when the yielded body
            // fails in this effect release, so the O_EXCL record would leak
            // on every failing install. The cleanup below is sequential
            // code and always runs once the body settles.
            const outcome = yield* Effect.exit(body)
            yield* Effect.ignore(Effect.tryPromise(() =>
              handle.close()
            ))
            yield* Effect.ignore(Effect.tryPromise(() => unlink(lockPath)))
            if (Exit.isFailure(outcome)) {
              return yield* Effect.failCause(outcome.cause)
            }
            return outcome.value
          })),
        Match.tag('exists', () =>
          Effect.gen(function*() {
            const content = yield* readTextOrEmpty(lockPath)
            const verdict = lockStaleness({ lockContent: content, now: options.now(), isPidAlive })
            const stale = Match.value(verdict).pipe(
              Match.tag('stale', () => true),
              Match.tag('fresh', () => false),
              Match.exhaustive,
            )
            if (stale) {
              // Take over: remove the dead record and retry immediately.
              yield* Effect.ignore(Effect.tryPromise(() => unlink(lockPath)))
              return yield* loop()
            }
            if (options.now() - start >= options.lockWaitMaxMs) {
              return yield* provisionFailure(`timed out waiting for the msb install lock at ${lockPath}`)
            }
            yield* Effect.sleep(options.lockPollMs)
            return yield* loop()
          })),
        Match.exhaustive,
      )
      return yield* outcome
    })
  return loop()
}

// ---------------------------------------------------------------------------
// Install execution
// ---------------------------------------------------------------------------

/** The write mode for one staged asset: the msb binary is executable on POSIX; krun is a plain library file. */
function assetMode(asset: 'msb' | 'krun'): number | undefined {
  if (process.platform === 'win32') {
    return undefined
  }
  return asset === 'msb' ? 0o755 : 0o644
}

/** Maps the verify verdict to its typed failure — `proceed` is not a failure (the caller checks it first); every refusal names its cause. */
function verifyFailure(outcome: VerifyOutcome, url: string, manifestUrl: string): ProvisionError {
  return Match.value(outcome).pipe(
    Match.tag('proceed', () => provisionFailure('unreachable: a verified asset did not proceed')),
    Match.tag('checksum-missing', ({ asset }) => provisionFailure(`no SHA-256 for '${asset}' in ${manifestUrl}`)),
    Match.tag('malformed-manifest', ({ line }) => provisionFailure(`malformed line in checksums.sha256: '${line}'`)),
    Match.tag('mismatch', ({ asset, expectedSha256, actualSha256 }) =>
      provisionFailure(
        `SHA-256 mismatch for ${asset} from ${url} (expected ${expectedSha256}, got ${actualSha256}) — ` +
          `delete the install dir and retry, or set MSB_PATH to a trusted msb binary`,
      )),
    Match.exhaustive,
  )
}

/**
 * Executes the ordered install plan: every `fetch-verified` step downloads
 * and manifest-verifies its asset before ANY rename, `ensure-dir` steps
 * create the staging directories, and the rename sequence (krun first, msb
 * last) is exactly the plan's — msb's presence is the commit marker.
 */
export function executeInstallPlan(
  options: ResolvedProvisionerOptions,
  plan: { readonly steps: readonly InstallStep[]; readonly renames: readonly RenameStep[] },
  manifestText: string,
  manifestUrl: string,
  msbPath: string,
  krunPath: string,
  /** The release-asset filename for each install slot — a `fetch-verified`
   * step carries the slot key ('msb'|'krun'), while the checksums manifest
   * is keyed by the release asset NAME. */
  assetNames: Readonly<Record<'msb' | 'krun', string>>,
): Effect.Effect<void, ProvisionError> {
  return Effect.gen(function*() {
    for (const step of plan.steps) {
      const executed = Match.value(step).pipe(
        Match.tag('ensure-dir', ({ path }) =>
          Effect.tryPromise({
            try: () => mkdir(path, { recursive: true }),
            catch: (error) => provisionFailure(`failed to create ${path}: ${describeError(error)}`),
          })),
        Match.tag('fetch-verified', ({ asset, url, tempFile }) =>
          Effect.gen(function*() {
            const bytes = yield* options.fetchBytes(url)
            const targetPath = asset === 'msb' ? msbPath : krunPath
            const verdict = verifyPlan({ manifest: manifestText, asset: assetNames[asset], bytes, targetPath })
            const proceed = Match.value(verdict).pipe(
              Match.tag('proceed', () => true),
              Match.tag('checksum-missing', () => false),
              Match.tag('mismatch', () => false),
              Match.tag('malformed-manifest', () => false),
              Match.exhaustive,
            )
            if (!proceed) {
              return yield* verifyFailure(verdict, url, manifestUrl)
            }
            const mode = assetMode(asset)
            yield* Effect.tryPromise({
              try: () => writeFile(tempFile, Buffer.from(bytes), mode === undefined ? undefined : { mode }),
              catch: (error) =>
                provisionFailure(`failed to write the staged asset ${tempFile}: ${describeError(error)}`),
            })
          })),
        Match.tag('rename', ({ from, to }) =>
          Effect.tryPromise({
            try: () => rename(from, to),
            catch: (error) =>
              provisionFailure(`failed to move '${from}' into place as '${to}': ${describeError(error)}`),
          })),
        Match.exhaustive,
      )
      yield* executed
    }
  })
}

/** One staged temp-file name — `.dl-<pid>-<stamp>-<asset>.part` inside the asset's install dir. */
function tempName(dir: string, asset: 'msb' | 'krun', now: number): string {
  return join(dir, `.dl-${process.pid}-${now}-${asset}.part`)
}

/** The staged install target paths for one platform + download plan. */
function installTargets(platform: Platform, cacheDir: string): MsbInstallPaths {
  return msbInstallPaths(cacheDir, platform)
}

/** The capability gate's named failure, mirroring upstream `provider.unsupportedReason`. */
function unsupportedReason(platform: Platform | undefined): string {
  if (platform === undefined) {
    return (
      `microsandbox has no build for ${process.platform}/${process.arch} — use the docker backend ` +
      `(RIGHTSIZE_BACKEND=docker) or set MSB_PATH to a binary you provide`
    )
  }
  if (process.platform === 'win32') {
    return (
      `Windows Hypervisor Platform is not enabled (run 'msb doctor --fix' in an elevated terminal, which may ` +
      `require a reboot), or use the docker backend`
    )
  }
  return '/dev/kvm is not accessible (need KVM, or run on Apple Silicon macOS)'
}

/**
 * The download+verify+atomic-install flow for one pinned release, executed
 * under the cross-process install lock. Re-checks installation after
 * acquiring the lock (another process may have finished while this one
 * waited), and on any failure best-effort removes the staged temp files —
 * the verify-before-rename invariant already guarantees no half-install.
 */
export function downloadAndInstall(
  options: ResolvedProvisionerOptions,
  platform: Platform,
  cacheDir: string,
  plan: Extract<EnvResolution, { readonly _tag: 'download' }>,
): Effect.Effect<ProvisionedMsbService, ProvisionError> {
  return Effect.gen(function*() {
    void installTargets(platform, cacheDir)
    const manifestUrl = `${options.baseUrl}/checksums.sha256`
    const manifestBytes = yield* options.fetchBytes(manifestUrl)
    const manifestText = Buffer.from(manifestBytes).toString('utf8')
    const parsed = parseChecksums(manifestText)
    const sums = Match.value(parsed).pipe(
      Match.tag('ok', ({ sums }) => Option.some(sums)),
      Match.tag('malformed', () => Option.none()),
      Match.exhaustive,
    )
    if (Option.isNone(sums)) {
      return yield* provisionFailure('malformed line in checksums.sha256')
    }
    const now = options.now()
    const msbDigest = sums.value.get(plan.msbAsset)
    const krunDigest = sums.value.get(plan.krunAsset)
    if (msbDigest === undefined || krunDigest === undefined) {
      const missing = msbDigest === undefined ? plan.msbAsset : plan.krunAsset
      return yield* provisionFailure(`no SHA-256 for '${missing}' in ${manifestUrl}`)
    }
    const msbArtifact: InstallArtifact = {
      asset: 'msb',
      assetName: plan.msbAsset,
      tempFile: tempName(dirname(plan.msbPath), 'msb', now),
      finalPath: plan.msbPath,
      sha256: msbDigest,
    }
    const krunArtifact: InstallArtifact = {
      asset: 'krun',
      assetName: plan.krunAsset,
      tempFile: tempName(dirname(plan.krunPath), 'krun', now),
      finalPath: plan.krunPath,
      sha256: krunDigest,
    }
    const steps = installPlan(options.baseUrl, msbArtifact, krunArtifact)
    const cleanupTemps = Effect.ignore(Effect.tryPromise(() => unlink(msbArtifact.tempFile))).pipe(
      Effect.andThen(Effect.ignore(Effect.tryPromise(() => unlink(krunArtifact.tempFile)))),
    )
    const install: Effect.Effect<void, ProvisionError> = Effect.gen(function*() {
      // Recheck under the lock: a concurrent winner may have completed the
      // install while this process waited for the lock.
      if (installedProbe(plan.msbPath, plan.krunPath)) {
        return
      }
      yield* executeInstallPlan(options, steps, manifestText, manifestUrl, plan.msbPath, plan.krunPath, {
        msb: plan.msbAsset,
        krun: plan.krunAsset,
      })
    })
    // The lock lives at `<install-dir>/.lock`; a provisioner starting from a
    // genuinely empty cache must be able to acquire it, so create the tree
    // before the lock (not inside the locked body — creation is idempotent).
    yield* Effect.tryPromise({
      try: () => mkdir(plan.installDir, { recursive: true }),
      catch: (error) => provisionFailure(`failed to create ${plan.installDir}: ${describeError(error)}`),
    })
    yield* withInstallLock(
      join(plan.installDir, '.lock'),
      options,
      install.pipe(Effect.catchEager((error) => cleanupTemps.pipe(Effect.andThen(Effect.fail(error))))),
    )
    return { msbPath: plan.msbPath }
  })
}

/** `plan.msbPath` carries its own absolute target; this named alias keeps the download branch's intent obvious. */
export type InstallPlan = Extract<EnvResolution, { readonly _tag: 'download' }>

/**
 * The full provision decision run: resolve the environment + capability
 * gates, then either hand back the ready binary or download/verify/install
 * the pinned release under the cross-process lock. Every branch produces the
 * typed `ProvisionError`; success carries the resolved `msb` binary path.
 */
export function provisionMsb(
  options: ProvisionerOptions = {},
): Effect.Effect<ProvisionedMsbService, ProvisionError, RightsizeConfig> {
  return Effect.gen(function*() {
    const opts = resolveProvisionerOptions(options)
    const config = yield* RightsizeConfig
    const platform = platformFor(process.platform, process.arch)
    if (platform === undefined) {
      return yield* provisionFailure(unsupportedReason(undefined))
    }
    const cacheDir = config.cacheDir ?? resolveCacheDir({
      rightsizeCacheDir: config.cacheDir,
      platform: process.platform,
      homedir: os.homedir(),
      localAppData: opts.localAppData,
    })
    const env: Record<string, string> = {}
    if (config.msbPath !== undefined) {
      env['MSB_PATH'] = config.msbPath
    }
    if (config.msbSkipDownload) {
      env['RIGHTSIZE_MSB_SKIP_DOWNLOAD'] = 'true'
    }
    const decision = envResolution({
      env,
      platform,
      cacheDir,
      isExecutable: isExecutableProbe,
      isInstalled: (msb, krun) => installedProbe(msb, krun),
    })
    const outcome = Match.value(decision).pipe(
      Match.tag('use-msb-path', ({ path }) => Effect.succeed({ msbPath: path })),
      Match.tag(
        'msb-path-unusable',
        ({ path }) => Effect.fail(provisionFailure(`MSB_PATH='${path}' is not an executable file`)),
      ),
      Match.tag('unsupported-platform', () => Effect.fail(provisionFailure(unsupportedReason(undefined)))),
      Match.tag('already-installed', ({ msbPath }) => Effect.succeed({ msbPath })),
      Match.tag('skip-download-missing', ({ msbPath }) =>
        Effect.fail(
          provisionFailure(
            `msb ${MSB_VERSION} not found at ${msbPath} and RIGHTSIZE_MSB_SKIP_DOWNLOAD=true — ` +
              `pre-install it there or point MSB_PATH at an msb binary`,
          ),
        )),
      Match.tag('download', (plan) => downloadAndInstall(opts, platform, cacheDir, plan)),
      Match.exhaustive,
    )
    return yield* outcome
  })
}
