/**
 * Checkpoint registry kernel tests (R14) — the on-disk
 * `checkpoints/<name>.json` record: name validation pre-I/O, read outcomes
 * (missing/corrupt/found), atomic write, list, best-effort removal, and
 * the ContainerSpec projection round-trip. Real tmp dirs, no services.
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  newContainerSpec,
  withCommand,
  withEnv,
  withExposedPorts,
  withMemoryLimit,
} from '../../model/spec-combinators.js'
import type { CheckpointRegistryEntry } from '../checkpoint.js'
import {
  fromCheckpointRegistryEntry,
  isValidCheckpointName,
  listCheckpointNames,
  readCheckpointRegistry,
  removeCheckpointRegistryFile,
  requireValidCheckpointName,
  toCheckpointRegistrySpec,
  writeCheckpointRegistryAtomic,
} from '../registry.js'

const freshDir = (): Promise<string> => fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-checkpoint-registry-'))

/** The Effect-typed writer over the atomic write — a named alias so the read tests read plainly. */
const writeCheckpointRegistryEntry = (
  dir: string,
  name: string,
  value: CheckpointRegistryEntry,
): Effect.Effect<void, unknown> => writeCheckpointRegistryAtomic(dir, name, value).pipe(Effect.asVoid)

const entry = (overrides: Partial<CheckpointRegistryEntry> = {}): CheckpointRegistryEntry => ({
  name: 'seeded-db',
  ref: 'rightsize/checkpoint:seeded-db',
  backend: 'docker',
  createdIso: '2026-01-01T00:00:00.000Z',
  spec: { env: { A: '1' }, command: ['sleep', '60'], exposedPorts: [80], memoryLimitMb: 256 },
  ...overrides,
})

describe('checkpoint name validation — pre-I/O', () => {
  it('Should_Accept_When_TheNameMatchesThePinnedPattern', () => {
    expect(isValidCheckpointName('seeded-db')).toBe(true)
    expect(isValidCheckpointName('a')).toBe(true)
    expect(isValidCheckpointName('a1-b2-c3')).toBe(true)
  })

  it('Should_Reject_When_TheNameCouldEscapeTheRegistryDir', () => {
    expect(isValidCheckpointName('..')).toBe(false)
    expect(isValidCheckpointName('../escape')).toBe(false)
    expect(isValidCheckpointName('UPPER')).toBe(false)
    expect(isValidCheckpointName('with space')).toBe(false)
  })

  it('Should_RejectOnTheEffectChannel_When_TheNameIsInvalid', () =>
    freshDir().then((dir) =>
      Effect.runPromiseExit(
        requireValidCheckpointName('../escape').pipe(Effect.flatMap((name) => readCheckpointRegistry(dir, name))),
      ).then(
        (exit) => {
          expect(Exit.isFailure(exit)).toBe(true)
        },
      )
    ))
})

describe('checkpoint registry read/write/list/remove', () => {
  it('Should_ReadMissing_When_TheNameHasNoEntry', () =>
    freshDir().then((dir) =>
      Effect.runPromise(readCheckpointRegistry(dir, 'never')).then((outcome) => {
        expect(outcome.kind).toBe('missing')
      })
    ))

  it('Should_ReadFound_When_TheEntryWasWritten', () =>
    freshDir().then((dir) =>
      Effect.runPromise(writeCheckpointRegistryEntry(dir, 'seeded-db', entry())).then(() =>
        Effect.runPromise(readCheckpointRegistry(dir, 'seeded-db')).then((outcome) => {
          expect(outcome).toEqual({ kind: 'found', entry: entry() })
        })
      )
    ))

  it('Should_ReadCorrupt_When_TheJsonIsMalformed', () =>
    freshDir().then((dir) =>
      fsp
        .writeFile(path.join(dir, 'checkpoints', 'broken.json'), '{not json', 'utf8')
        .catch(() =>
          fsp.mkdir(path.join(dir, 'checkpoints'), { recursive: true }).then(() =>
            fsp.writeFile(path.join(dir, 'checkpoints', 'broken.json'), '{not json', 'utf8')
          )
        )
        .then(() =>
          Effect.runPromise(readCheckpointRegistry(dir, 'broken')).then((outcome) => {
            expect(outcome.kind).toBe('corrupt')
          })
        )
    ))

  it('Should_ListExistingNames_When_TheDirectoryIsSeeded', () =>
    freshDir().then((dir) =>
      Effect.runPromise(writeCheckpointRegistryEntry(dir, 'one', entry({ name: 'one' }))).then(() =>
        Effect.runPromise(writeCheckpointRegistryEntry(dir, 'two', entry({ name: 'two', backend: 'msb' }))).then(() =>
          Effect.runPromise(listCheckpointNames(dir)).then((names) => {
            expect([...names].sort()).toEqual(['one', 'two'])
          })
        )
      )
    ))

  it('Should_RemoveTheRegistryFile_When_Asked', () =>
    freshDir().then((dir) =>
      Effect.runPromise(writeCheckpointRegistryEntry(dir, 'one', entry({ name: 'one' }))).then(() =>
        Effect.runPromise(removeCheckpointRegistryFile(dir, 'one')).then(() =>
          Effect.runPromise(readCheckpointRegistry(dir, 'one')).then((outcome) => {
            expect(outcome.kind).toBe('missing')
          })
        )
      )
    ))

  it('Should_NoOpTheRemoval_When_TheEntryNeverExisted', () =>
    freshDir().then((dir) =>
      Effect.runPromise(removeCheckpointRegistryFile(dir, 'never')).then(() =>
        Effect.runPromise(readCheckpointRegistry(dir, 'never')).then((outcome) => {
          expect(outcome.kind).toBe('missing')
        })
      )
    ))
})

describe('the checkpoint spec projection', () => {
  it('Should_RoundTripTheSpec_When_ProjectedAndRestored', () => {
    const spec = withMemoryLimit(
      withCommand(
        withExposedPorts(withEnv(newContainerSpec('postgres:17', 'rz-pg'), 'PGPORT', '5432'), 5432),
        'postgres',
      ),
      512,
    )
    const projected = toCheckpointRegistrySpec(spec)
    expect(projected).toEqual({
      env: { PGPORT: '5432' },
      command: ['postgres'],
      exposedPorts: [5432],
      memoryLimitMb: 512,
    })
    const restored = fromCheckpointRegistryEntry({ ...entry(), spec: projected })
    expect(restored.image).toBe('rightsize/checkpoint:seeded-db')
    expect(restored.env).toEqual([['PGPORT', '5432']])
    expect(restored.ports).toEqual([{ hostPort: 0, guestPort: 5432 }])
    expect(restored.memoryLimitMb).toBe(512)
    expect(restored.checkpointRef).toBe('rightsize/checkpoint:seeded-db')
  })
})
