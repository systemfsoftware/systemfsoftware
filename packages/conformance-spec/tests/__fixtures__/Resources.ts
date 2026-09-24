/**
 * Planted-bug and correct resources for the interruption-release check (R12).
 * Every factory owns fresh state per call, so one scenario never shares a
 * resource with another, and every probe observes the real system it judges —
 * the shared lock cell, or a real temporary file on disk (R9).
 */
import { Effect, Exit, FileSystem, Path, PlatformError } from 'effect'
import type * as Scope from 'effect/Scope'

export interface ReleaseSpec<ProbeFailure> {
  readonly probe: Effect.Effect<void, ProbeFailure>
}

/** Why a probe refused: the resource it checks is still held. */
export interface ProbeRefusal {
  readonly reason: string
}

export interface HeldResource {
  readonly program: Effect.Effect<void, never, Scope.Scope>
  readonly check: ReleaseSpec<ProbeRefusal>
}

/** A program that holds a real temporary file, plus the probe that judges its removal. */
export interface TempFileResource {
  readonly program: Effect.Effect<void, PlatformError.PlatformError, Scope.Scope>
  readonly check: ReleaseSpec<ProbeRefusal>
  /** Removes the directory the program writes into, whatever the check found. */
  readonly cleanup: Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem>
}

interface LockCell {
  held: boolean
}

const freshLock = (): LockCell => ({ held: false })

/** One public operation of the lock: claim it, unless somebody else holds it. */
const tryAcquireOn = (lock: LockCell): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (lock.held) return false
    lock.held = true
    return true
  })

const letGoOf = (lock: LockCell): Effect.Effect<void> =>
  Effect.sync(() => {
    lock.held = false
  })

const refused = (reason: string): Effect.Effect<void, ProbeRefusal> => Effect.fail({ reason })

/**
 * A fresh caller asks for the lock; a refusal means the lock is still held.
 * The probe runs after the scope is closed, so the checker's own finalizers
 * are already done — a refusal names the program's leak, not the check's.
 */
const freshCallerProbe = (lock: LockCell): Effect.Effect<void, ProbeRefusal> =>
  Effect.flatMap(tryAcquireOn(lock), (acquired) =>
    acquired
      ? Effect.as(letGoOf(lock), undefined)
      : refused('a fresh caller could not acquire the lock'))

/** Planted bug: the release is registered only after a later step succeeds. */
export const successPathLock = (): HeldResource => {
  const lock = freshLock()
  return {
    program: Effect.gen(function*() {
      yield* tryAcquireOn(lock)
      yield* Effect.yieldNow
      yield* Effect.addFinalizer(() => letGoOf(lock))
    }),
    check: { probe: freshCallerProbe(lock) },
  }
}

/** The correct counterpart: the release is registered in the same step as the claim. */
export const releasingLock = (): HeldResource => {
  const lock = freshLock()
  return {
    program: Effect.acquireRelease(tryAcquireOn(lock), () => letGoOf(lock)),
    check: { probe: freshCallerProbe(lock) },
  }
}

/**
 * Planted bug on the real filesystem: the file is created before its removal
 * is registered, so stopping the holder in between leaves it behind. The
 * directory and the probe both reach the host through the same FileSystem
 * service, and the check closes the program's scope before the probe reads
 * real state — never the program's bookkeeping (R9).
 */
export const tempFileReport = (
  fileSystem: FileSystem.FileSystem,
): Effect.Effect<TempFileResource, PlatformError.PlatformError, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const directory = yield* tempDirectory(fileSystem)
    const report = path.join(directory, 'report.txt')
    return {
      program: Effect.gen(function*() {
        const written = yield* Effect.exit(fileSystem.writeFileString(report, 'started'))
        if (Exit.isFailure(written)) return yield* Effect.die(new Error('the program could not create the file'))
        yield* Effect.yieldNow
        yield* Effect.addFinalizer(() => Effect.orDie(fileSystem.remove(report)))
      }),
      check: { probe: removalProbe(fileSystem, report) },
      cleanup: fileSystem.remove(directory, { recursive: true, force: true }),
    }
  })

const tempDirectory = (
  fileSystem: FileSystem.FileSystem,
): Effect.Effect<string, PlatformError.PlatformError> => fileSystem.makeTempDirectory({ prefix: 'conformance-spec-' })

const removalProbe = (
  fileSystem: FileSystem.FileSystem,
  report: string,
): Effect.Effect<void, ProbeRefusal> =>
  Effect.flatMap(
    Effect.mapError(fileSystem.exists(report), probeRefused),
    (stillThere) => stillThere ? refused('the file is still on disk') : Effect.void,
  )
const probeRefused = (cause: PlatformError.PlatformError): ProbeRefusal => ({
  reason: `the probe could not read the file: ${cause._tag}`,
})
