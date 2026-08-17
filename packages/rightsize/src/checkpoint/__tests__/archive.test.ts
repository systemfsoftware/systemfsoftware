/**
 * The checkpoint archive (R14) — export/import contracts:
 *
 * - the manifest parser's pure paths: a valid manifest parses, and every
 *   malformed shape (non-JSON, unsupported format version, a missing
 *   required field, a malformed spec, a non-string/non-null name) is a
 *   typed `MalformedCheckpointArchiveError` naming the archive path;
 * - the export guards fire BEFORE any backend work: a checkpoint of
 *   another backend is `CheckpointBackendMismatchError` with zero store
 *   calls, and a stale artifact is `CheckpointArtifactMissingError`;
 * - the tar invocations' argv shape — pure `TarCli` construction, the
 *   scripted CLI seam (nothing spawned);
 * - a real export→import round trip through the host `tar` with a
 *   scripted backend store, plus the import-side guards: a manifest whose
 *   `name` does not match the pinned pattern is refused before any backend
 *   call, and an archive missing its `artifact` member is malformed.
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect, Layer, Result, Schema as S } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import type { ContainerSpec } from '../../model/container-spec.js'
import {
  CheckpointArtifactMissingError,
  CheckpointBackendMismatchError,
  InvalidCheckpointNameError,
  MalformedCheckpointArchiveError,
} from '../../model/errors.js'
import { newContainerSpec } from '../../model/spec-combinators.js'
import { RightsizeConfig } from '../../runtime/config.js'
import type { RightsizeConfigService } from '../../runtime/config.js'
import type { CheckpointStoreService } from '../../runtime/runtime.js'
import { CheckpointStore } from '../../runtime/runtime.js'
import { Selection } from '../../runtime/selection.workflow.js'
import { type CheckpointArchiveMetadata, parseCheckpointArchiveMetadata, writeCheckpointArchive } from '../archive.js'
import type { Checkpoint } from '../checkpoint.js'
import { exportCheckpointArchive, importCheckpointArchive } from '../checkpoints.js'
import { runTar, TarCli, tarDirArg } from '../tar.js'

// =============================================================================
// Fixtures
// =============================================================================

/** The archive manifest shape the tests craft — mirrors the pinned `checkpoint.json`. */
const manifestJson = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    rightsizeArchive: 1,
    name: 'fixture-ckpt',
    ref: 'rightsize/checkpoint:fixture-ckpt',
    backend: 'docker',
    createdIso: '2026-08-17T00:00:00.000Z',
    spec: { env: {}, command: null, exposedPorts: [6379], memoryLimitMb: null },
    ...overrides,
  })

const validMetadata = (name: string | null = 'fixture-ckpt'): CheckpointArchiveMetadata => ({
  rightsizeArchive: 1,
  name,
  ref: 'rightsize/checkpoint:fixture-ckpt',
  backend: 'docker',
  createdIso: '2026-08-17T00:00:00.000Z',
  spec: { env: {}, command: null, exposedPorts: [6379], memoryLimitMb: null },
})

const checkpointSpec = (): ContainerSpec => ({
  ...newContainerSpec('redis:8.2-alpine', 'rz-ckpt-test'),
  ports: [{ guestPort: 6379, hostPort: 0 }],
})

const dockerCheckpoint = (): Checkpoint => ({
  ref: 'rightsize/checkpoint:fixture-ckpt',
  backend: 'docker',
  spec: checkpointSpec(),
})

/** A scripted checkpoint store: every call is recorded; the artifact callbacks write/read real bytes. */
interface ScriptedStore {
  readonly service: CheckpointStoreService
  readonly calls: string[]
}

const scriptedStore = (): ScriptedStore => {
  const calls: string[] = []
  const service: CheckpointStoreService = {
    createCheckpoint: (_handle, ref) => {
      calls.push(`createCheckpoint:${ref}`)
      return Effect.void
    },
    removeCheckpoint: (ref) => {
      calls.push(`removeCheckpoint:${ref}`)
      return Effect.void
    },
    hasCheckpoint: (ref) => {
      calls.push(`hasCheckpoint:${ref}`)
      return Effect.succeed(true)
    },
    exportCheckpoint: (ref, destFile) => {
      calls.push(`exportCheckpoint:${ref}`)
      return Effect.promise(() => fsp.writeFile(destFile, 'artifact-payload'))
    },
    importCheckpoint: (srcFile, ref) => {
      calls.push(`importCheckpoint:${ref}`)
      return Effect.promise(() => fsp.readFile(srcFile, 'utf8')).pipe(Effect.map(() => ref))
    },
  }
  return { service, calls }
}

const configOf = (cacheDir: string): RightsizeConfigService => ({
  backend: 'auto',
  reaper: 'off',
  cacheDir,
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

const dockerSelectionLayer = Layer.succeed(Selection, {
  backend: 'docker',
  dockerSocketPath: '/tmp/rightsize-archive-test.sock',
})

const archiveEnv = (
  cacheDir: string,
  store: CheckpointStoreService,
): Layer.Layer<CheckpointStore | Selection | RightsizeConfig> =>
  Layer.mergeAll(
    Layer.succeed(CheckpointStore, store),
    dockerSelectionLayer,
    Layer.succeed(RightsizeConfig, configOf(cacheDir)),
  )

// =============================================================================
// Outcome helpers
// =============================================================================

const runExportOutcome = (
  cp: Checkpoint,
  destPath: string,
  env: Layer.Layer<CheckpointStore | Selection | RightsizeConfig>,
): Promise<{ readonly _tag: 'ok' } | { readonly _tag: 'fail'; readonly failure: unknown }> =>
  Effect.runPromise(
    Effect.match(exportCheckpointArchive(cp, destPath).pipe(Effect.provide(env)), {
      onSuccess: (): { readonly _tag: 'ok' } => ({ _tag: 'ok' }),
      onFailure: (failure): { readonly _tag: 'fail'; readonly failure: unknown } => ({ _tag: 'fail', failure }),
    }),
  )

const runImportOutcome = (
  srcPath: string,
  env: Layer.Layer<CheckpointStore | Selection | RightsizeConfig>,
): Promise<{ readonly _tag: 'ok'; readonly cp: Checkpoint } | { readonly _tag: 'fail'; readonly failure: unknown }> =>
  Effect.runPromise(
    Effect.match(importCheckpointArchive(srcPath).pipe(Effect.provide(env)), {
      onSuccess: (cp): { readonly _tag: 'ok'; readonly cp: Checkpoint } => ({ _tag: 'ok', cp }),
      onFailure: (failure): { readonly _tag: 'fail'; readonly failure: unknown } => ({ _tag: 'fail', failure }),
    }),
  )

const exportFailureOf = (
  outcome: { readonly _tag: 'ok' } | { readonly _tag: 'fail'; readonly failure: unknown },
): unknown => {
  if (outcome._tag === 'ok') {
    throw new Error('expected the export to refuse')
  }
  return outcome.failure
}

const importFailureOf = (
  outcome: { readonly _tag: 'ok'; readonly cp: Checkpoint } | { readonly _tag: 'fail'; readonly failure: unknown },
): unknown => {
  if (outcome._tag === 'ok') {
    throw new Error('expected the import to refuse')
  }
  return outcome.failure
}

const importCpOf = (
  outcome: { readonly _tag: 'ok'; readonly cp: Checkpoint } | { readonly _tag: 'fail'; readonly failure: unknown },
): Checkpoint => {
  if (outcome._tag === 'fail') {
    throw new Error(`expected the import to succeed: ${String(outcome.failure)}`)
  }
  return outcome.cp
}

const typedFailure = <A>(failure: unknown, guard: (value: unknown) => value is A, expected: string): A => {
  if (!guard(failure)) {
    throw new Error(`expected ${expected}, got ${String(failure)}`)
  }
  return failure
}

const parsedOf = (
  parsed: Result.Result<CheckpointArchiveMetadata, MalformedCheckpointArchiveError>,
): CheckpointArchiveMetadata => {
  if (Result.isFailure(parsed)) {
    throw new Error(`manifest refused: ${parsed.failure.reason}`)
  }
  return parsed.success
}

const refusalOf = (
  parsed: Result.Result<CheckpointArchiveMetadata, MalformedCheckpointArchiveError>,
): MalformedCheckpointArchiveError => {
  if (Result.isSuccess(parsed)) {
    throw new Error('manifest parsed — expected a refusal')
  }
  return parsed.failure
}

const tmpDirs: string[] = []

const makeTmp = (prefix: string): Promise<string> =>
  fsp.mkdtemp(path.join(os.tmpdir(), `rightsize-archive-${prefix}-`)).then((dir) => {
    tmpDirs.push(dir)
    return dir
  })

afterEach(() => Promise.all(tmpDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true }))))

// =============================================================================
// Pure manifest parsing
// =============================================================================

describe('checkpoint archive manifest', () => {
  it('Should_ParseTheManifest_When_TheJsonIsValid', () => {
    const parsed = parsedOf(parseCheckpointArchiveMetadata(manifestJson(), '/some/archive.tar'))
    expect(parsed.name).toBe('fixture-ckpt')
    expect(parsed.backend).toBe('docker')
    expect(parsed.ref).toBe('rightsize/checkpoint:fixture-ckpt')
    expect(parsed.spec.exposedPorts).toEqual([6379])
  })

  it('Should_ParseAnUnnamedManifest_When_NameIsNull', () => {
    const parsed = parsedOf(parseCheckpointArchiveMetadata(manifestJson({ name: null }), '/some/archive.tar'))
    expect(parsed.name).toBeNull()
  })

  it('Should_RefuseTheManifestAsMalformed_When_TheJsonIsInvalid', () => {
    const failure = refusalOf(parseCheckpointArchiveMetadata('{not json', '/some/archive.tar'))
    expect(failure._tag).toBe('MalformedCheckpointArchiveError')
    expect(failure.archivePath).toBe('/some/archive.tar')
    expect(failure.reason).toContain('not valid JSON')
  })

  it('Should_RefuseTheManifest_When_TheFormatVersionIsUnsupported', () => {
    const failure = refusalOf(parseCheckpointArchiveMetadata(manifestJson({ rightsizeArchive: 99 }), '/a.tar'))
    expect(failure.reason).toContain('version')
  })

  it('Should_RefuseTheManifest_When_TheRefFieldIsMissing', () => {
    const body = JSON.parse(manifestJson()) as Record<string, unknown>
    delete body['ref']
    const failure = refusalOf(parseCheckpointArchiveMetadata(JSON.stringify(body), '/a.tar'))
    expect(failure.reason).toContain('ref')
  })

  it('Should_RefuseTheManifest_When_TheSpecIsMalformed', () => {
    const failure = refusalOf(parseCheckpointArchiveMetadata(manifestJson({ spec: { env: 'nope' } }), '/a.tar'))
    expect(failure.reason).toContain('spec')
  })

  it('Should_RefuseTheManifest_When_NameIsNeitherStringNorNull', () => {
    const failure = refusalOf(parseCheckpointArchiveMetadata(manifestJson({ name: 42 }), '/a.tar'))
    expect(failure.reason).toContain('name')
  })
})

// =============================================================================
// The tar argv seam — pure construction, nothing spawned
// =============================================================================

describe('checkpoint archive tar argv', () => {
  it('Should_BuildTheCreateArgv_When_TarCliCreatesAnArchive', () => {
    expect(TarCli.create('fixture.tar', '/tmp/stage', ['checkpoint.json', 'artifact'])).toEqual([
      '-cf',
      'fixture.tar',
      '-C',
      '/tmp/stage',
      'checkpoint.json',
      'artifact',
    ])
  })

  it('Should_BuildTheExtractArgv_When_TarCliExtractsAnArchive', () => {
    expect(TarCli.extract('fixture.tar', '/tmp/out')).toEqual(['-xf', 'fixture.tar', '-C', '/tmp/out'])
  })

  it('Should_NormalizeWindowsPaths_When_ThePlatformIsWin32', () => {
    expect(tarDirArg('C:\\stage\\dir', 'win32')).toBe('C:/stage/dir')
    expect(tarDirArg('/tmp/stage', 'linux')).toBe('/tmp/stage')
  })
})

// =============================================================================
// Export guards
// =============================================================================

describe('checkpoint archive export', () => {
  it('Should_RefuseExportWithBackendMismatch_When_TheCheckpointBelongsToAnotherBackendBeforeAnyStoreCall', () => {
    const store = scriptedStore()
    const cp = { ...dockerCheckpoint(), backend: 'msb' as const }
    return makeTmp('mismatch').then((dir) => {
      const dest = path.join(dir, 'out.tar')
      return runExportOutcome(cp, dest, archiveEnv(dir, store.service))
    }).then((outcome) => {
      const failure = exportFailureOf(outcome)
      const mismatch = typedFailure(failure, S.is(CheckpointBackendMismatchError), 'CheckpointBackendMismatchError')
      expect(mismatch.createdOnBackend).toBe('msb')
      // The mismatch is rejected before any backend or filesystem work.
      expect(store.calls).toEqual([])
    })
  })

  it('Should_RefuseWithArtifactMissing_When_TheBackendArtifactIsGone', () => {
    const store = scriptedStore()
    store.service.hasCheckpoint = () => Effect.succeed(false)
    return makeTmp('stale').then((dir) => {
      const dest = path.join(dir, 'out.tar')
      return runExportOutcome(dockerCheckpoint(), dest, archiveEnv(dir, store.service))
    }).then((outcome) => {
      const failure = exportFailureOf(outcome)
      const missing = typedFailure(failure, S.is(CheckpointArtifactMissingError), 'CheckpointArtifactMissingError')
      expect(missing.ref).toBe('rightsize/checkpoint:fixture-ckpt')
    })
  })
})

// =============================================================================
// Import — a real tar round trip with a scripted store
// =============================================================================

describe('checkpoint archive import', () => {
  it('Should_ImportWhatWasExported_When_AnArchiveRoundTripsThroughTheStore', () => {
    const store = scriptedStore()
    return makeTmp('roundtrip').then((dir) => {
      const dest = path.join(dir, 'roundtrip.tar')
      const env = archiveEnv(dir, store.service)
      return runExportOutcome(dockerCheckpoint(), dest, env).then((exported) => {
        expect(exported._tag).toBe('ok')
        return fsp.stat(dest).then((stats) => {
          expect(stats.isFile()).toBe(true)
          expect(stats.size).toBeGreaterThan(0)
          return runImportOutcome(dest, env)
        })
      })
    }).then((imported) => {
      const cp = importCpOf(imported)
      expect(cp.ref).toBe('rightsize/checkpoint:fixture-ckpt')
      expect(cp.backend).toBe('docker')
      // The store handled both directions — export wrote the artifact bytes,
      // import read them back.
      expect(store.calls.some((call) => call.startsWith('exportCheckpoint:'))).toBe(true)
      expect(store.calls.some((call) => call.startsWith('importCheckpoint:'))).toBe(true)
    })
  })

  it('Should_RefuseTheImport_When_TheNamedManifestViolatesTheNamePattern', () => {
    const store = scriptedStore()
    return makeTmp('badname').then((dir) => {
      const dest = path.join(dir, 'bad-name.tar')
      // A real archive whose manifest name breaks the pinned pattern —
      // written through the same archive writer the exporter uses.
      return Effect.runPromise(
        writeCheckpointArchive(
          dest,
          validMetadata('Bad_Name'),
          (artifactPath) => Effect.promise(() => fsp.writeFile(artifactPath, 'artifact-payload')),
        ),
      ).then(() => runImportOutcome(dest, archiveEnv(dir, store.service)))
    }).then((outcome) => {
      const failure = importFailureOf(outcome)
      const invalid = typedFailure(failure, S.is(InvalidCheckpointNameError), 'InvalidCheckpointNameError')
      expect(invalid.checkpointName).toBe('Bad_Name')
      expect(store.calls).toEqual([])
    })
  })

  it('Should_RefuseTheImport_When_TheArtifactMemberIsMissing', () => {
    const store = scriptedStore()
    return makeTmp('noartifact').then((dir) => {
      const stage = path.join(dir, 'stage')
      const dest = path.join(dir, 'no-artifact.tar')
      return fsp.mkdir(stage).then(() => fsp.writeFile(path.join(stage, 'checkpoint.json'), manifestJson())).then(() =>
        runTar(TarCli.create(path.basename(dest), stage, ['checkpoint.json']), 30_000, dir)
      ).then(() => runImportOutcome(dest, archiveEnv(dir, store.service)))
    }).then((outcome) => {
      const failure = importFailureOf(outcome)
      const malformed = typedFailure(failure, S.is(MalformedCheckpointArchiveError), 'MalformedCheckpointArchiveError')
      expect(malformed.reason).toContain('artifact')
    })
  })
})
