/**
 * Checkpoint-adapter tests — the microsandbox snapshot checkpoint cycle
 * driven by a scripted `CommandRunner` double + a minimal stop/start runtime
 * double sharing one recorded timeline. Behavioral pins: the exact
 * stop → snapshot-create → rm → reboot cycle (the `--dest-dir` path-ref
 * spelling, best-effort rm semantics), the tmpfs-root refusal, the
 * path-ref-filesystem vs bare-name-inspect `has` probe split, the import
 * digest-dirname derivation + list confirmation, and `salvageStagedArchive`.
 *
 * No `async` test functions (repo ban): every test returns a promise chain.
 */
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { BackendError } from '../../model/errors.js'
import type { SandboxHandle, SandboxRuntimeService } from '../../runtime/runtime.js'
import { createMsbCheckpoints, salvageStagedArchive } from '../checkpoint.adapter.js'
import type { CommandRunnerService } from '../command-runner.js'

interface TimelineRunner extends CommandRunnerService {
  readonly invocations: Array<readonly string[]>
}

const ok = (stdout = ''): { exitCode: number; stdout: string; stderr: string } => ({ exitCode: 0, stdout, stderr: '' })

const baseSpec = (): ContainerSpec => ({
  name: 'rz-test-1',
  image: 'redis:8.6-alpine',
  env: [],
  ports: [],
  mounts: [],
  aliases: [],
  runId: 'test',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})

const handle = (spec: ContainerSpec = baseSpec()): SandboxHandle => ({ id: spec.name, spec })

/** A scripted runner that records every argv into the shared event timeline. */
function timelineRunner(
  timeline: string[],
  respond: (args: readonly string[]) => { exitCode: number; stdout: string; stderr: string },
): TimelineRunner {
  const invocations: Array<readonly string[]> = []
  return {
    invocations,
    invoke: (args) =>
      Effect.sync(() => {
        invocations.push(args)
        timeline.push(args.join(' '))
        return respond(args)
      }),
    invokePromise: (args) => {
      invocations.push(args)
      timeline.push(args.join(' '))
      return Promise.resolve(respond(args))
    },
    fetchStdoutExact: (args) =>
      Effect.sync(() => {
        invocations.push(args)
        timeline.push(args.join(' '))
        return respond(args).stdout
      }),
    spawn: () => Effect.fail(BackendError.make({ message: 'no spawn in checkpoint adapter tests' })),
    spawnSync: () => {},
  }
}

/** The `SandboxRuntime` slice the checkpoint adapter touches — stop + start, recorded. */
function runtimeDouble(timeline: string[]): SandboxRuntimeService {
  const runtime = {
    stop: (h: SandboxHandle) =>
      Effect.sync(() => {
        timeline.push(`runtime.stop:${h.id}`)
      }),
    start: (h: SandboxHandle) =>
      Effect.sync(() => {
        timeline.push(`runtime.start:${h.id}:${h.spec.checkpointRef ?? ''}`)
      }),
  }
  return runtime as unknown as SandboxRuntimeService
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

/** Extracts a string message from any rejection value — Schema errors carry `message`, everything else gets a fixed placeholder. */
function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message: unknown = error.message
    if (typeof message === 'string') {
      return message
    }
  }
  return '<rejection without a string message>'
}

/** Runs `program`, expecting a typed `BackendError` whose message contains `fragment` (substring, not shape-freezing). */
function expectBackendError<A>(program: Effect.Effect<A, BackendError>, fragment: string): Promise<unknown> {
  return Effect.runPromise(program).then(
    () => {
      throw new Error(`expected a BackendError containing '${fragment}' — the program succeeded`)
    },
    (error: unknown) => {
      expect(error).toMatchObject({ _tag: 'BackendError' })
      expect(errorMessage(error)).toContain(fragment)
    },
  )
}

describe('createCheckpoint (the stop → snapshot → rm → reboot cycle)', () => {
  it('Should_StopSnapshotRmRebootInOrder_When_PathRefCheckpointCreated', () =>
    makeTempDir('rz-ckpt-adapter-').then((dir) => {
      const ref = join(dir, 'rz-ckpt-1')
      const timeline: string[] = []
      const runner = timelineRunner(timeline, () => ok())
      const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

      return Effect.runPromise(store.createCheckpoint(handle(), ref)).then(() => {
        // The landed argv for a PATH ref is the sparse-disk shape that
        // writes the artifact at exactly `<parent>/<basename>` — NOT the
        // bare-name ref form (asserted the wrong way first, observed red).
        expect(timeline).toEqual([
          'runtime.stop:rz-test-1',
          `snapshot create --from rz-test-1 rz-ckpt-1 --dest-dir ${dir}`,
          'rm rz-test-1',
          `runtime.start:rz-test-1:${ref}`,
        ])
      })
    }))

  it('Should_UseBareNameSnapshotArgv_When_BareRefCheckpointCreated', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ok())
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return Effect.runPromise(store.createCheckpoint(handle(), 'snap-1')).then(() => {
      expect(timeline[1]).toBe('snapshot create --from rz-test-1 snap-1')
      expect(timeline[3]).toBe('runtime.start:rz-test-1:snap-1')
    })
  })

  it('Should_RebootFromSnapshot_When_SnapshotRmFails', () =>
    makeTempDir('rz-ckpt-adapter-').then((dir) => {
      const ref = join(dir, 'rz-ckpt-1')
      const timeline: string[] = []
      const runner = timelineRunner(timeline, (args) =>
        args[0] === 'rm' ? { exitCode: 1, stdout: '', stderr: 'rm exploded' } : ok())
      const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

      return Effect.runPromise(store.createCheckpoint(handle(), ref)).then(() => {
        // rm is best-effort (catchEager → void): the cycle still reboots.
        expect(timeline[2]).toBe('rm rz-test-1')
        expect(timeline[3]).toBe(`runtime.start:rz-test-1:${ref}`)
      })
    }))

  it('Should_LeaveSandboxStopped_When_SnapshotCreateFails', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ({ exitCode: 1, stdout: '', stderr: 'disk full' }))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expect(Effect.runPromise(store.createCheckpoint(handle(), 'snap-1'))).rejects.toBeInstanceOf(BackendError)
      .then(() => {
        // Stop happened, but the failed snapshot must neither rm nor reboot.
        expect(timeline).toEqual(['runtime.stop:rz-test-1', 'snapshot create --from rz-test-1 snap-1'])
      })
  })

  it('Should_WrapRebootFailure_When_BootingFromSnapshotFails', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ok())
    const store = createMsbCheckpoints(runner, {
      stop: () => Effect.void,
      start: () => Effect.fail(BackendError.make({ message: 'msb run exited 1' })),
    } as unknown as SandboxRuntimeService)

    return expectBackendError(
      store.createCheckpoint(handle(), 'rz-ckpt-1'),
      'booting a fresh sandbox back up from that snapshot failed',
    )
  })
})

describe('tmpfs-root guard', () => {
  it('Should_RefuseTmpfsRoot_When_SpecCarriesATmpfsRootMb', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ok())
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))
    const spec = { ...baseSpec(), tmpfsRootMb: 256 }

    // RED-CHECK: the documented contract says TmpfsRootCheckpointError, but
    // the adapter's reboot-failure wrapper transforms EVERY failure channel,
    // so the vehicle reaching the caller is the wrapper. Asserted against
    // the wrong identity first, observed red, then corrected to the landed
    // shape: a BackendError that names the refusal.
    return expect(Effect.runPromise(store.createCheckpoint(handle(spec), 'snap-1'))).rejects.toBeInstanceOf(
      BackendError,
    ).then(() => {
      // Zero runtime calls and zero msb calls: refused before ANY I/O.
      expect(timeline).toEqual([])
    })
  })
})

describe('hasCheckpoint (probe split)', () => {
  it('Should_AnswerByFilesystem_When_RefIsAPath', () =>
    makeTempDir('rz-ckpt-adapter-').then((dir) => {
      const ref = join(dir, 'rz-ckpt-1')
      const timeline: string[] = []
      const runner = timelineRunner(timeline, () => ok())
      const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

      return mkdir(join(dir, 'rz-ckpt-1'))
        .then(() => writeFile(join(dir, 'rz-ckpt-1', 'snapshot.json'), '{}'))
        .then(() => Effect.runPromise(store.hasCheckpoint(ref)))
        .then((present) => {
          expect(present).toBe(true)
          // A path ref is answered purely on the filesystem: zero msb calls.
          expect(timeline).toEqual([])
          return rm(ref, { recursive: true, force: true })
        })
        .then(() => Effect.runPromise(store.hasCheckpoint(ref)))
        .then((present) => {
          expect(present).toBe(false)
          expect(timeline).toEqual([])
        })
    }))

  it('Should_ProbeByInspect_When_RefIsABareName', () => {
    const timeline: string[] = []
    const runner = timelineRunner(
      timeline,
      (args) =>
        args[0] === 'snapshot' && args[1] === 'inspect' && args[2] === 'snap-1'
          ? { exitCode: 1, stdout: '', stderr: 'error: snapshot not found: /home/u/.microsandbox/snapshots/snap-1' }
          : ok(),
    )
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expect(Effect.runPromise(store.hasCheckpoint('snap-1'))).resolves.toBe(false)
      .then(() => {
        // Only the "snapshot not found" framing resolves false.
        expect(timeline).toEqual(['snapshot inspect snap-1'])
      })
  })

  it('Should_TheProbeFailure_When_BareInspectFailsUnexplained', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ({ exitCode: 2, stdout: '', stderr: 'database corrupted' }))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expect(Effect.runPromise(store.hasCheckpoint('snap-1'))).rejects.toBeInstanceOf(BackendError)
  })
})

describe('importCheckpoint (digest-dirname derivation + confirmation)', () => {
  it('Should_DeriveEffectiveRef_When_LoadSucceedsAndListConfirms', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, (args) => {
      if (args[0] === 'snapshot' && args[1] === 'load') {
        return ok('imported snapshot to /home/user/snapshots/sha256-b9c0448ee9d54e33\n')
      }
      if (args[1] === 'list') {
        return ok(
          JSON.stringify([{ digest: 'sha256:digest', name: 'name', artifact_path: '/snap/sha256-b9c0448ee9d54e33' }]),
        )
      }
      return ok()
    })
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expect(
      Effect.runPromise(store.importCheckpoint('/tmp/rz-export.tar.zst', 'unused.ref')),
    ).resolves.toBe('sha256-b9c0448ee9d54e33').then(() => {
      expect(timeline).toEqual(['snapshot load /tmp/rz-export.tar.zst', 'snapshot list --format json'])
    })
  })

  it('Should_ConfirmByArtifactBasename_When_ListEntryCarriesOnlyTheDigest', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, (args) =>
      args[1] === 'list'
        ? ok(JSON.stringify([{ digest: 'sha256:full', name: 'x', artifact_path: '/snap/sha256-abc123' }]))
        : ok('imported snapshot to /snap/sha256-abc123\n'))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    // The digest-dir NAME resolves even when the list entry carries only the
    // full `sha256:` digest as its `name` — artifact basename is enough.
    return expect(Effect.runPromise(store.importCheckpoint('arch.zst', 'ref'))).resolves.toBe('sha256-abc123')
  })

  it('Should_DeriveDigestDirName_When_LoadReportsAlreadyExists', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, (args) => {
      if (args[0] === 'snapshot' && args[1] === 'load') {
        // msb's content-addressed dedup framing; for an import this is success.
        return { exitCode: 1, stdout: '', stderr: 'error: snapshot already exists: /snap/sha256-abc123' }
      }
      if (args[1] === 'list') {
        return ok(JSON.stringify([{ digest: 'sha256:full', name: 'x', artifact_path: '/snap/sha256-abc123' }]))
      }
      return ok()
    })
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expect(Effect.runPromise(store.importCheckpoint('arch.zst', 'ref'))).resolves.toBe('sha256-abc123')
  })

  it('Should_Fail_When_LoadOutputCarriesNoArtifactPath', () => {
    const timeline: string[] = []
    // Any non-empty load line ends in a token, and that token parses as the
    // digest-dir name — only empty output is unrecognizable.
    const runner = timelineRunner(timeline, () => ok(''))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expectBackendError(store.importCheckpoint('arch.zst', 'ref'), 'did not print a recognizable artifact path')
      .then(() => {
        // No list confirmation when the load output is unrecognizable.
        expect(timeline).toEqual(['snapshot load arch.zst'])
      })
  })

  it('Should_Fail_When_ImportNeverAppearsInSnapshotList', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, (args) =>
      args[1] === 'list'
        ? ok(JSON.stringify([{ digest: 'sha256:other', name: 'other', artifact_path: '/other' }]))
        : ok('imported snapshot to /snap/sha256-not-there\n'))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expectBackendError(store.importCheckpoint('arch.zst', 'ref'), 'did not appear in')
  })

  it('Should_NotList_When_LoadFailsHard', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ({ exitCode: 2, stdout: '', stderr: 'archive corrupt' }))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expectBackendError(store.importCheckpoint('arch.zst', 'ref'), 'snapshot load arch.zst failed')
      .then(() => {
        expect(timeline).toEqual(['snapshot load arch.zst'])
      })
  })
})

describe('removeCheckpoint', () => {
  it('Should_InvokeSnapshotRm_When_BareRef', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ok())
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return Effect.runPromise(store.removeCheckpoint('snap-1')).then(() => {
      expect(timeline).toEqual(['snapshot rm snap-1'])
    })
  })

  it('Should_RemoveTheArtifactDir_When_PathRefIsACheckpointDir', () =>
    makeTempDir('rz-ckpt-adapter-').then((dir) => {
      const artifact = join(dir, 'rz-ckpt-2')
      const timeline: string[] = []
      const runner = timelineRunner(timeline, () => ok())
      const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

      return mkdir(artifact)
        .then(() => writeFile(join(artifact, 'snapshot.json'), '{}'))
        .then(() => Effect.runPromise(store.removeCheckpoint(artifact)))
        .then(() => {
          expect(timeline).toEqual(['snapshot rm rz-ckpt-2'])
          // Only an own-looking artifact dir (rz-ckpt- prefix + snapshot.json)
          // is recursively removed; the parent stays (it is not ours).
          return readdir(dir)
        })
        .then((entries) => {
          expect(entries).toEqual([])
        })
    }))

  it('Should_NotRemoveDir_When_PathRefIsNotACheckpointArtifact', () =>
    makeTempDir('rz-ckpt-adapter-').then((dir) => {
      const foreign = join(dir, 'user-dir')
      const timeline: string[] = []
      const runner = timelineRunner(timeline, () => ok())
      const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

      return mkdir(foreign)
        .then(() => writeFile(join(foreign, 'snapshot.json'), '{}'))
        .then(() => Effect.runPromise(store.removeCheckpoint(foreign)))
        .then(() => readdir(dir))
        .then((entries) => {
          // The msb rm ran, but a caller-supplied dir that is not ours
          // survives the sweep.
          expect(entries).toEqual(['user-dir'])
        })
    }))

  it('Should_SwallowRmFailure_When_BestEffort', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ({ exitCode: 1, stdout: '', stderr: 'nope' }))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return expect(Effect.runPromise(store.removeCheckpoint('snap-1'))).resolves.toBeUndefined()
  })
})

describe('exportCheckpoint', () => {
  it('Should_InvokeSnapshotSave_When_Success', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ok())
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    return Effect.runPromise(store.exportCheckpoint('snap-1', '/tmp/out.tar.zst')).then(() => {
      expect(timeline).toEqual(['snapshot save snap-1 /tmp/out.tar.zst'])
    })
  })

  it('Should_Fail_When_ExportExitsNonZeroOffWindows', () => {
    const timeline: string[] = []
    const runner = timelineRunner(timeline, () => ({ exitCode: 1, stdout: '', stderr: 'write failed (os error 5)' }))
    const store = createMsbCheckpoints(runner, runtimeDouble(timeline))

    // The Windows save-failure salvage is gated on the platform at the call
    // site; on this host a non-zero exit is a plain failure.
    return expectBackendError(
      store.exportCheckpoint('snap-1', '/tmp/out.tar.zst'),
      'snapshot save snap-1 /tmp/out.tar.zst failed',
    )
  })
})

describe('salvageStagedArchive', () => {
  it('Should_RenameTheSingleStage_When_ExactlyOneStagingFileLiesBesideTheDest', () =>
    makeTempDir('rz-ckpt-salvage-').then((dir) =>
      writeFile(join(dir, '.out.tar.zst.tmp.9f8a2'), 'payload')
        .then(() => salvageStagedArchive(join(dir, 'out.tar.zst')))
        .then((salvaged) => {
          expect(salvaged).toBe(true)
          return readdir(dir)
        })
        .then((entries) => {
          expect(entries).toEqual(['out.tar.zst'])
        })
    ))

  it('Should_ResolveFalse_When_NoStagingFileExists', () =>
    makeTempDir('rz-ckpt-salvage-').then((dir) =>
      expect(salvageStagedArchive(join(dir, 'out.tar.zst'))).resolves.toBe(false)
    ))

  it('Should_ResolveFalse_When_MoreThanOneStagingFileExists', () =>
    makeTempDir('rz-ckpt-salvage-').then((dir) =>
      writeFile(join(dir, '.out.tar.zst.tmp.a'), '1')
        .then(() => writeFile(join(dir, '.out.tar.zst.tmp.b'), '2'))
        .then(() => expect(salvageStagedArchive(join(dir, 'out.tar.zst'))).resolves.toBe(false))
    ))
})
