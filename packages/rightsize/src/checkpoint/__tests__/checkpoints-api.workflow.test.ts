/**
 * The Checkpoints surface tests (R14) — find/list/remove/exportTo/importFrom
 * over a recording `CheckpointStore` double + a fixed docker selection + a
 * real tmp cache dir, plus the portable-archive round-trip (real tar,
 * doubled store): registry CRUD against the active backend, backend-tag
 * gating, the artifact probe, the export preconditions, and the manifest
 * backend-mismatch rejection BEFORE any import call.
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CheckpointArtifactMissingError,
  CheckpointBackendMismatchError,
  MalformedCheckpointArchiveError,
} from '../../model/errors.js'
import { newContainerSpec, withEnv } from '../../model/spec-combinators.js'
import { RightsizeConfig, type RightsizeConfigService } from '../../runtime/config.js'
import { CheckpointStore, type CheckpointStoreService } from '../../runtime/runtime.js'
import { Selection } from '../../runtime/selection.workflow.js'
import { writeCheckpointArchive } from '../archive.js'
import type { Checkpoint, CheckpointRegistryEntry } from '../checkpoint.js'
import type { CheckpointServices } from '../checkpoints.js'
import {
  exportCheckpointArchive,
  findCheckpoint,
  importCheckpointArchive,
  listCheckpoints,
  removeCheckpoint,
} from '../checkpoints.js'
import { writeCheckpointRegistryAtomic } from '../registry.js'

// =============================================================================
// Doubles and plumbing
// =============================================================================

/** The recording store double — artifact presence + import/export/remove edges recorded. */
interface StoreDouble {
  readonly service: CheckpointStoreService
  readonly hasCalls: string[]
  readonly removeCalls: string[]
  readonly exportCalls: Array<{ readonly ref: string; readonly destFile: string }>
  readonly importCalls: Array<{ readonly srcFile: string; readonly ref: string }>
}

const storeDouble = (artifacts: ReadonlyArray<string>): StoreDouble => {
  const hasCalls: string[] = []
  const removeCalls: string[] = []
  const exportCalls: Array<{ readonly ref: string; readonly destFile: string }> = []
  const importCalls: Array<{ readonly srcFile: string; readonly ref: string }> = []
  return {
    service: {
      createCheckpoint: () => Effect.void,
      removeCheckpoint: (ref) => {
        removeCalls.push(ref)
        return Effect.void
      },
      hasCheckpoint: (ref) => {
        hasCalls.push(ref)
        return Effect.succeed(artifacts.includes(ref))
      },
      exportCheckpoint: (ref, destFile) =>
        Effect.promise(() =>
          fsp.writeFile(destFile, `artifact-of-${ref}`).then(() => {
            exportCalls.push({ ref, destFile })
          })
        ),
      importCheckpoint: (srcFile, ref) => {
        importCalls.push({ srcFile, ref })
        return Effect.succeed(ref)
      },
    },
    hasCalls,
    removeCalls,
    exportCalls,
    importCalls,
  }
}

const freshDir = (): Promise<string> => fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-checkpoints-api-'))

const configOf = (cacheDir: string): RightsizeConfigService => ({
  backend: 'auto',
  reaper: 'off',
  cacheDir,
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: false,
})

const provideEnvironment = <A, E>(
  effect: Effect.Effect<A, E, CheckpointServices>,
  cacheDir: string,
  store: StoreDouble,
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provide(Layer.mergeAll(
      Layer.succeed(CheckpointStore, store.service),
      Layer.succeed(Selection, { backend: 'docker', dockerSocketPath: '/tmp/test-docker.sock' }),
      Layer.succeed(RightsizeConfig, configOf(cacheDir)),
    )),
  )

const entryOf = (overrides: Partial<CheckpointRegistryEntry> = {}): CheckpointRegistryEntry => ({
  name: 'seeded-db',
  ref: 'rightsize/checkpoint:seeded-db',
  backend: 'docker',
  createdIso: '2026-01-01T00:00:00.000Z',
  spec: { env: { A: '1' }, command: null, exposedPorts: [], memoryLimitMb: null },
  ...overrides,
})

const writeEntry = (dir: string, entry: CheckpointRegistryEntry): Promise<void> =>
  Effect.runPromise(writeCheckpointRegistryAtomic(dir, entry.name, entry).pipe(Effect.asVoid))

const checkpointOf = (ref: string): Checkpoint => ({
  ref,
  backend: 'docker',
  spec: withEnv(newContainerSpec('postgres:17', 'rz-pg'), 'PGPORT', '5432'),
})

// =============================================================================
// find / list / remove
// =============================================================================

describe('Checkpoints.find — the active-backend probe', () => {
  it('Should_ReturnTheEntryProbed_When_TheBackendMatchesAndTheArtifactExists', () =>
    freshDir().then((dir) => {
      const store = storeDouble(['rightsize/checkpoint:seeded-db'])
      return writeEntry(dir, entryOf()).then(() =>
        Effect.runPromise(provideEnvironment(findCheckpoint('seeded-db'), dir, store)).then((checkpoint) => {
          expect(checkpoint?.ref).toBe('rightsize/checkpoint:seeded-db')
          expect(store.hasCalls).toEqual(['rightsize/checkpoint:seeded-db'])
        })
      )
    }))

  it('Should_TreatTheEntryAsStale_When_TheArtifactIsGone', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return writeEntry(dir, entryOf()).then(() =>
        Effect.runPromise(provideEnvironment(findCheckpoint('seeded-db'), dir, store)).then((checkpoint) => {
          expect(checkpoint).toBeUndefined()
        })
      )
    }))

  it('Should_ReturnTheEntryUnprobed_When_TheRecordedBackendDiffers', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return writeEntry(dir, entryOf({ backend: 'msb' })).then(() =>
        Effect.runPromise(provideEnvironment(findCheckpoint('seeded-db'), dir, store)).then((checkpoint) => {
          expect(checkpoint?.backend).toBe('msb')
          expect(store.hasCalls).toEqual([])
        })
      )
    }))
})

describe('CheckService.list — registry contents only, never probed', () => {
  it('Should_ListTheEntries_When_TwoAreSeeded', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return writeEntry(dir, entryOf({ name: 'one', ref: 'rightsize/checkpoint:one' }))
        .then(() => writeEntry(dir, entryOf({ name: 'two', backend: 'msb', ref: 'rightsize/checkpoint:two' })))
        .then(() =>
          Effect.runPromise(provideEnvironment(listCheckpoints, dir, store)).then((checkpoints) => {
            expect(new Set(checkpoints.map((cp) => cp.ref))).toEqual(
              new Set(['rightsize/checkpoint:one', 'rightsize/checkpoint:two']),
            )
            expect(store.hasCalls).toEqual([])
          })
        )
    }))
})

describe('Checkpoints.remove — best-effort artifact + registry removal, backend-gated', () => {
  it('Should_RemoveTheArtifactAndTheEntry_When_TheBackendMatches', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return writeEntry(dir, entryOf()).then(() =>
        Effect.runPromise(provideEnvironment(removeCheckpoint('seeded-db'), dir, store)).then((removed) => {
          expect(removed).toBe(true)
          expect(store.removeCalls).toEqual(['rightsize/checkpoint:seeded-db'])
        })
      )
    }))

  it('Should_LeaveTheArtifactAlone_When_TheBackendDiffers', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return writeEntry(dir, entryOf({ backend: 'msb' })).then(() =>
        Effect.runPromise(provideEnvironment(removeCheckpoint('seeded-db'), dir, store)).then((removed) => {
          expect(removed).toBe(true)
          expect(store.removeCalls).toEqual([])
        })
      )
    }))

  it('Should_ReportFalse_When_NoEntryExists', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return Effect.runPromise(provideEnvironment(removeCheckpoint('never-checkpointed'), dir, store)).then(
        (removed) => {
          expect(removed).toBe(false)
        },
      )
    }))
})

// =============================================================================
// exportTo / importFrom
// =============================================================================

const foreignArchiveAt = (archivePath: string): Promise<unknown> =>
  Effect.runPromise(
    writeCheckpointArchive(
      archivePath,
      {
        rightsizeArchive: 1,
        name: null,
        ref: 'rz-ckpt-foreign',
        backend: 'msb',
        createdIso: '2026-01-01T00:00:00.000Z',
        spec: { env: {}, command: null, exposedPorts: [], memoryLimitMb: null },
      },
      (artifactPath) => Effect.promise(() => fsp.writeFile(artifactPath, 'foreign-artifact-bytes')),
    ),
  )

describe('Checkpoints.exportTo — preconditions then a portable archive', () => {
  it('Should_RejectTheMismatch_When_TheBackendDiffersBeforeAnyStoreCall', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      const mismatch: Checkpoint = { ...checkpointOf('rightsize/checkpoint:seeded-db'), backend: 'msb' }
      return Effect.runPromise(
        provideEnvironment(exportCheckpointArchive(mismatch, path.join(dir, 'out', 'x.tar')), dir, store),
      ).then(
        () => {
          throw new Error('expected CheckpointBackendMismatchError')
        },
        (error: unknown) => {
          expect(error).toBeInstanceOf(CheckpointBackendMismatchError)
          expect(store.hasCalls).toEqual([])
          expect(store.exportCalls).toEqual([])
        },
      )
    }))

  it('Should_ProduceAnArchive_When_TheBackendMatchesAndTheArtifactExists', () =>
    freshDir().then((dir) => {
      const store = storeDouble(['rightsize/checkpoint:seeded-db'])
      const destFile = path.join(dir, 'out', 'archive.tar')
      return writeEntry(dir, entryOf()).then(() =>
        Effect.runPromise(
          provideEnvironment(
            exportCheckpointArchive(checkpointOf('rightsize/checkpoint:seeded-db'), destFile),
            dir,
            store,
          ),
        ).then(() =>
          fsp.readFile(destFile).then((bytes) => {
            expect(bytes.length).toBeGreaterThan(0)
            expect(store.exportCalls[0]?.ref).toBe('rightsize/checkpoint:seeded-db')
          })
        )
      )
    }))

  it('Should_RefuseExportingAStaleArtifact_When_TheBackendHasNoSuchImage', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      return Effect.runPromise(
        provideEnvironment(
          exportCheckpointArchive(checkpointOf('rightsize/checkpoint:seeded-db'), path.join(dir, 'out', 'x.tar')),
          dir,
          store,
        ),
      ).then(
        () => {
          throw new Error('expected CheckpointArtifactMissingError')
        },
        (error: unknown) => {
          expect(error).toBeInstanceOf(CheckpointArtifactMissingError)
        },
      )
    }))
})

describe('Checkpoints.importFrom — manifest validation before the backend, then the round-trip', () => {
  it('Should_RejectTheMismatch_When_TheManifestBackendDiffersBeforeImportRuns', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      const foreignArchive = path.join(dir, 'foreign.tar')
      return foreignArchiveAt(foreignArchive).then(() =>
        Effect.runPromise(provideEnvironment(importCheckpointArchive(foreignArchive), dir, store)).then(
          () => {
            throw new Error('expected CheckpointBackendMismatchError')
          },
          (error: unknown) => {
            expect(error).toBeInstanceOf(CheckpointBackendMismatchError)
            expect(store.importCalls).toEqual([])
          },
        )
      )
    }))

  it('Should_RoundTripTheArchive_When_ExportedThenImported', () =>
    freshDir().then((dir) => {
      const ref = 'rightsize/checkpoint:roundtrip'
      const store = storeDouble([ref])
      const destFile = path.join(dir, 'out', 'archive.tar')
      return Effect.runPromise(
        provideEnvironment(exportCheckpointArchive(checkpointOf(ref), destFile), dir, store),
      )
        .then(() => Effect.runPromise(provideEnvironment(importCheckpointArchive(destFile), dir, store)))
        .then((restored) => {
          expect(restored.ref).toBe(ref)
          expect(restored.backend).toBe('docker')
          expect(store.importCalls[0]?.ref).toBe(ref)
        })
    }))

  it('Should_RejectMalformed_When_TheArchiveLacksTheManifest', () =>
    freshDir().then((dir) => {
      const store = storeDouble([])
      const junk = path.join(dir, 'junk.tar')
      return fsp.writeFile(junk, 'not a tar at all').then(() =>
        Effect.runPromise(provideEnvironment(importCheckpointArchive(junk), dir, store)).then(
          () => {
            throw new Error('expected MalformedCheckpointArchiveError')
          },
          (error: unknown) => {
            expect(error).toBeInstanceOf(MalformedCheckpointArchiveError)
            expect(store.importCalls).toEqual([])
          },
        )
      )
    }))
})
