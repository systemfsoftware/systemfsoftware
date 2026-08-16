/**
 * Provisioner-adapter tests — the effectful half of msb toolchain
 * provisioning driven with scripted `fetchBytes` seams and a real temp
 * install dir: verify-before-install (a checksum mismatch must abort with
 * `ProvisionError` and leave NOTHING staged, releasing the install lock),
 * the full install under the O_EXCL lock (both assets verified and renamed,
 * msb last, temp files and lock removed), the empty-cache path (the lock's
 * parent dir is created before the lock, so a fresh cache installs), and
 * the install-lock matrix — dead-holder takeover, unparseable-content
 * takeover, live-holder wait exhaustion, release on a failing body, and the
 * happy uncontended acquire/release. No network and no real msb anywhere.
 *
 * No `async` test functions and no `Date.now()` (repo bans): every test
 * returns a promise chain; wall-clock inputs come from `Clock`.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Clock, Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { ProvisionError } from '../../model/errors.js'
import {
  downloadAndInstall,
  provisionFailure,
  resolveProvisionerOptions,
  withInstallLock,
} from '../provisioner.adapter.js'
import { sha256Hex } from '../provisioner/checksum.kernel.js'
import { type EnvResolution, envResolution } from '../provisioner/env.kernel.js'

const textEncoder = new TextEncoder()
const GOOD_PAYLOAD = 'verified-asset-payload'
const CORRUPTED_PAYLOAD = 'corrupted-bytes-that-never-match'
const bytes = (text: string): Uint8Array => textEncoder.encode(text)
const nowMs = (): number => Effect.runSync(Clock.currentTimeMillis)

/** A plaintext two-asset manifest naming the SHA-256 of `GOOD_PAYLOAD`. */
function goodManifest(): string {
  const digest = sha256Hex(bytes(GOOD_PAYLOAD))
  return `${digest}  msb-linux-x86_64\n${digest}  libkrunfw-linux-x86_64.so\n`
}

const tempDirs: string[] = []
afterEach(() => {
  const dirs = tempDirs.splice(0)
  return Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)))
})

function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix)).then((dir) => {
    tempDirs.push(dir)
    return dir
  })
}

/** A raw `download` plan for an empty cache under `dir` — the `downloadAndInstall` input. */
function downloadPlanFor(cacheDir: string): Extract<EnvResolution, { readonly _tag: 'download' }> {
  const decision = envResolution({
    env: {},
    platform: 'linux-x64',
    cacheDir,
    isExecutable: () => false,
    isInstalled: () => false,
  })
  if (decision._tag !== 'download') {
    throw new Error(`expected a download plan, got ${decision._tag}`)
  }
  return decision
}

function failureMessage(failure: unknown): string {
  if (typeof failure === 'object' && failure !== null && 'message' in failure) {
    const message: unknown = failure.message
    if (typeof message === 'string') {
      return message
    }
  }
  return '<non-string rejection>'
}

describe('downloadAndInstall (verify-before-install)', () => {
  it('Should_RejectTheInstall_When_TheAssetNameManifestDigestMismatches', () =>
    makeTempDir('cache-dl-x-').then((cacheDir) => {
      const plan = downloadPlanFor(cacheDir)
      const fetched: string[] = []
      const options = resolveProvisionerOptions({
        fetchBytes: (url) =>
          Effect.sync(() => {
            fetched.push(url)
            return url.endsWith('checksums.sha256') ? bytes(goodManifest()) : bytes(CORRUPTED_PAYLOAD)
          }),
        now: nowMs,
      })

      // A completely empty cache: no pre-created install dir. The adapter
      // creates the lock's parent, acquires the lock, fetches and verifies
      // the msb asset, and REFUSES the mismatch with the asset name and its
      // real digest wording — nothing staged, lock released on the failure.
      return Effect.runPromise(downloadAndInstall(options, 'linux-x64', cacheDir, plan)).then(
        () => {
          throw new Error('expected the checksum mismatch to be rejected')
        },
        (failure: unknown) => {
          expect(failure).toMatchObject({ _tag: 'ProvisionError' })
          expect(failureMessage(failure)).toContain('SHA-256 mismatch for msb-linux-x86_64')
          expect(failureMessage(failure)).toContain('expected')
          expect(failureMessage(failure)).toContain('got')
          // Manifest first, then the msb asset; krun is never fetched.
          expect(fetched.map((url) => url.slice(url.lastIndexOf('/') + 1))).toEqual([
            'checksums.sha256',
            'msb-linux-x86_64',
          ])
          return readdir(join(cacheDir, 'msb', '0.6.9', 'bin'))
        },
      ).then((binEntries) => {
        // Nothing was ever staged, the msb binary is absent, and the FAILING
        // body RELEASED the install lock.
        expect(binEntries).toEqual([])
        expect(existsSync(plan.msbPath)).toBe(false)
        expect(existsSync(join(cacheDir, 'msb', '0.6.9', '.lock'))).toBe(false)
      })
    }))

  it('Should_RejectThePrecheck_When_TheManifestIsKeyedBySlotName', () =>
    makeTempDir('cache-dl-').then((cacheDir) => {
      const plan = downloadPlanFor(cacheDir)
      const fetched: string[] = []
      const digest = sha256Hex(bytes(GOOD_PAYLOAD))
      const slotKeyedManifest = `${digest}  msb\n${digest}  krun\n`
      const options = resolveProvisionerOptions({
        fetchBytes: (url) =>
          Effect.sync(() => {
            fetched.push(url)
            return url.endsWith('checksums.sha256') ? bytes(slotKeyedManifest) : bytes(GOOD_PAYLOAD)
          }),
        now: nowMs,
      })

      // The digest lookup keys on the RELEASE-ASSET NAME, so a manifest
      // keyed by install slot can never satisfy the pre-check.
      return Effect.runPromise(downloadAndInstall(options, 'linux-x64', cacheDir, plan)).then(
        () => {
          throw new Error('expected the slot-keyed manifest to be rejected')
        },
        (failure: unknown) => {
          expect(failure).toMatchObject({ _tag: 'ProvisionError' })
          expect(failureMessage(failure)).toContain("no SHA-256 for 'msb-linux-x86_64'")
          // Never fetched either asset: rejected before the download steps.
          expect(fetched.map((url) => url.slice(url.lastIndexOf('/') + 1))).toEqual(['checksums.sha256'])
        },
      )
    }))

  it('Should_DownloadAndInstall_When_GivenACompletelyEmptyCache', () =>
    makeTempDir('cache-fresh-').then((cacheDir) => {
      const plan = downloadPlanFor(cacheDir)
      const fetched: string[] = []
      const options = resolveProvisionerOptions({
        fetchBytes: (url) =>
          Effect.sync(() => {
            fetched.push(url)
            return url.endsWith('checksums.sha256') ? bytes(goodManifest()) : bytes(GOOD_PAYLOAD)
          }),
        now: nowMs,
      })

      // No pre-created install dir: the adapter creates the lock's parent,
      // then downloads, verifies, and atomically installs both assets.
      return Effect.runPromise(downloadAndInstall(options, 'linux-x64', cacheDir, plan)).then((installed) => {
        expect(installed.msbPath).toBe(plan.msbPath)
        expect(fetched.map((url) => url.slice(url.lastIndexOf('/') + 1))).toEqual([
          'checksums.sha256',
          'msb-linux-x86_64',
          'libkrunfw-linux-x86_64.so',
        ])
        // The verified binary is in place and the lock is gone.
        expect(existsSync(plan.msbPath)).toBe(true)
        expect(existsSync(plan.krunPath)).toBe(true)
        expect(existsSync(join(cacheDir, 'msb', '0.6.9', '.lock'))).toBe(false)
        return readdir(join(cacheDir, 'msb', '0.6.9', 'bin'))
      }).then((binEntries) => {
        expect(binEntries).toEqual(['msb'])
      })
    }))
})

describe('withInstallLock (O_EXCL staleness matrix)', () => {
  it('Should_ReleaseTheLock_When_TheBodyFails', () =>
    makeTempDir('cache-lock-').then((dir) => {
      const lockPath = join(dir, '.lock')
      const options = resolveProvisionerOptions({ now: nowMs, lockWaitMaxMs: 200, lockPollMs: 5 })
      const failingBody: Effect.Effect<void, ProvisionError> = Effect.fail(provisionFailure('boom'))
      return Effect.runPromise(withInstallLock(lockPath, options, failingBody)).then(
        () => {
          throw new Error('expected the body failure to propagate')
        },
        (failure: unknown) => {
          expect(failure).toMatchObject({ _tag: 'ProvisionError' })
          // The O_EXCL record never leaks: a failing body releases the lock.
          expect(existsSync(lockPath)).toBe(false)
        },
      )
    }))
  it('Should_TakeOverTheLock_When_TheHolderIsDead', () =>
    makeTempDir('cache-lock-').then((dir) => {
      const lockPath = join(dir, '.lock')
      const options = resolveProvisionerOptions({ now: nowMs, lockWaitMaxMs: 200, lockPollMs: 5 })
      const seen: { holder?: string } = {}
      const body = Effect.gen(function*() {
        seen.holder = yield* Effect.promise(() => readFile(lockPath, 'utf8'))
      })

      return writeFile(lockPath, `999999999\n${nowMs() - 60_000}\n`)
        .then(() => Effect.runPromise(withInstallLock(lockPath, options, body)))
        .then(() => {
          // The lock file now carries OUR pid: the dead record was really
          // replaced by O_EXCL takeover, then removed on release.
          expect(seen.holder?.startsWith(`${process.pid}\n`)).toBe(true)
          expect(existsSync(lockPath)).toBe(false)
        })
    }))

  it('Should_TakeOverTheLock_When_ContentIsUnparseable', () =>
    makeTempDir('cache-lock-').then((dir) => {
      const lockPath = join(dir, '.lock')
      const options = resolveProvisionerOptions({ now: nowMs, lockWaitMaxMs: 200, lockPollMs: 5 })
      let ran = false
      const body = Effect.sync(() => {
        ran = true
      })

      return writeFile(lockPath, 'total-garbage')
        .then(() => Effect.runPromise(withInstallLock(lockPath, options, body)))
        .then(() => {
          expect(ran).toBe(true)
          expect(existsSync(lockPath)).toBe(false)
        })
    }))

  it('Should_TimeOut_When_TheLockHolderIsAliveAndFresh', () =>
    makeTempDir('cache-lock-').then((dir) => {
      const lockPath = join(dir, '.lock')
      const options = resolveProvisionerOptions({ now: nowMs, lockWaitMaxMs: 40, lockPollMs: 5 })
      let ran = false
      const body = Effect.sync(() => {
        ran = true
      })
      // A live PID (our own) with a fresh timestamp is NOT stale; the waiter
      // polls until its budget lapses and must never touch the foreign lock.
      return writeFile(lockPath, `${process.pid}\n${nowMs()}\n`)
        .then(() => Effect.runPromise(withInstallLock(lockPath, options, body)))
        .then(
          () => {
            throw new Error('expected the fresh-lock wait to time out')
          },
          (failure: unknown) => {
            expect(failureMessage(failure)).toContain('timed out waiting for the msb install lock')
          },
        )
        .then(() => {
          expect(ran).toBe(false)
          expect(existsSync(lockPath)).toBe(true)
        })
    }))

  it('Should_AcquireAndRelease_When_Uncontended', () =>
    makeTempDir('cache-lock-').then((dir) => {
      const lockPath = join(dir, '.lock')
      const options = resolveProvisionerOptions({ now: nowMs, lockWaitMaxMs: 100, lockPollMs: 5 })
      let visibleDuringBody = false
      const body = Effect.sync(() => {
        visibleDuringBody = existsSync(lockPath)
      })

      return Effect.runPromise(withInstallLock(lockPath, options, body)).then(() => {
        // The O_EXCL record was on disk while the body ran, then removed.
        expect(visibleDuringBody).toBe(true)
        expect(existsSync(lockPath)).toBe(false)
      })
    }))
})
