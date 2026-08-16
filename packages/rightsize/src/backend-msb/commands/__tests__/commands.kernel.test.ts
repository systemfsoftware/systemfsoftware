import { describe, expect, it } from 'vitest'

import { MsbCommands, type MsbRunSpec } from '../msb.kernel.js'
import { respawnDecision } from '../tunnel.kernel.js'

/**
 * Recorded invocation vectors, ported verbatim from upstream rightsize-node's
 * `src/backend-msb/commands.test.ts` (behavioral source, Apache-2.0). Every
 * expected argv below is a captured real invocation of the pinned msb binary
 * (or an upstream-verified spelling), NOT a re-derivation — a green test here
 * pins our builder output to upstream's invocation grammar byte for byte.
 */
function baseSpec(overrides: Partial<MsbRunSpec> = {}): MsbRunSpec {
  return {
    name: 'rz-abc12345-1',
    image: 'redis:8.6-alpine',
    env: [],
    command: undefined,
    ports: [],
    mounts: [],
    memoryLimitMb: undefined,
    checkpointRef: undefined,
    diskLimitMb: undefined,
    tmpfsRootMb: undefined,
    networkDisabled: false,
    ...overrides,
  }
}

describe('MsbCommands.run (recorded upstream vectors)', () => {
  it('Should_EmitMinimalArgv_When_SpecHasOnlyNameAndImage', () => {
    const argv = MsbCommands.run(baseSpec())
    expect(argv).toEqual(['run', '--name', 'rz-abc12345-1', 'redis:8.6-alpine'])
    expect(argv.includes('-d')).toBe(false)
  })

  it('Should_PlaceMemoryFlagImmediatelyAfterName_When_MemoryLimitSet', () => {
    const argv = MsbCommands.run(baseSpec({ memoryLimitMb: 1024 }))
    expect(argv.slice(0, 5)).toEqual(['run', '--name', 'rz-abc12345-1', '-m', '1024M'])
  })

  it('Should_EmitPortsEnvMountsBeforeImage_When_SpecCarriesThem', () => {
    expect(
      MsbCommands.run(
        baseSpec({
          ports: [{ hostPort: 15432, guestPort: 5432 }],
          env: [['POSTGRES_USER', 'test']],
          mounts: [{ hostPath: '/host/f.txt', guestPath: '/guest/f.txt', readOnly: true }],
        }),
      ),
    ).toEqual([
      'run',
      '--name',
      'rz-abc12345-1',
      '-p',
      '15432:5432',
      '-e',
      'POSTGRES_USER=test',
      '--mount-file',
      // readOnly: true above — the token is always present, and `ro` is what makes the
      // flag mean anything on this backend.
      '/host/f.txt:/guest/f.txt:ro,nodev',
      'redis:8.6-alpine',
    ])
  })

  it('Should_AppendCommandAfterDashDash_When_CommandSet', () => {
    const withCmd = MsbCommands.run(baseSpec({ command: ['redis-server', '--port', '6379'] }))
    expect(withCmd.slice(-4)).toEqual(['--', 'redis-server', '--port', '6379'])

    const withoutCmd = MsbCommands.run(baseSpec())
    expect(withoutCmd.includes('--')).toBe(false)
  })

  it('Should_EmitFullRunOrdering_When_AllFieldsSet', () => {
    expect(
      MsbCommands.run(
        baseSpec({
          memoryLimitMb: 512,
          ports: [{ hostPort: 1111, guestPort: 22 }],
          env: [['A', '1']],
          mounts: [{ hostPath: '/h', guestPath: '/g', readOnly: false }],
          command: ['sh', '-c', 'true'],
        }),
      ),
    ).toEqual([
      'run',
      '--name',
      'rz-abc12345-1',
      '-m',
      '512M',
      '-p',
      '1111:22',
      '-e',
      'A=1',
      '--mount-file',
      // readOnly: false above. A two-segment spec is never emitted: on Windows msb
      // splits a token-less spec at the drive letter's colon and rejects the path tail.
      '/h:/g:rw,nodev',
      'redis:8.6-alpine',
      '--',
      'sh',
      '-c',
      'true',
    ])
  })

  it('Should_EmitRootDiskAfterMemory_When_DiskLimitSet', () => {
    expect(
      MsbCommands.run(baseSpec({ diskLimitMb: 2048 })),
    ).toEqual(['run', '--name', 'rz-abc12345-1', '--root-disk', '2048M', 'redis:8.6-alpine'])
  })

  it('Should_EmitTmpfsRootDisk_When_TmpfsRootSet', () => {
    expect(
      MsbCommands.run(baseSpec({ tmpfsRootMb: 512 })),
    ).toEqual(['run', '--name', 'rz-abc12345-1', '--root-disk', 'tmpfs:512M', 'redis:8.6-alpine'])
  })

  it('Should_EmitNetPrivate_When_NetworkDisabled', () => {
    expect(
      MsbCommands.run(baseSpec({ networkDisabled: true })),
    ).toEqual(['run', '--name', 'rz-abc12345-1', '--net', 'private', 'redis:8.6-alpine'])
  })

  it('Should_EmitMemoryRootDiskAndNetPrivateBeforePorts_When_AllSet', () => {
    expect(
      MsbCommands.run(
        baseSpec({
          memoryLimitMb: 1024,
          diskLimitMb: 4096,
          networkDisabled: true,
          ports: [{ hostPort: 1111, guestPort: 22 }],
        }),
      ),
    ).toEqual([
      'run',
      '--name',
      'rz-abc12345-1',
      '-m',
      '1024M',
      '--root-disk',
      '4096M',
      '--net',
      'private',
      '-p',
      '1111:22',
      'redis:8.6-alpine',
    ])
  })

  it('Should_BootFromSnapshotInsteadOfImage_When_CheckpointRefSet', () => {
    const argv = MsbCommands.run(
      baseSpec({
        checkpointRef: 'rz-ckpt-abcdef012345',
        memoryLimitMb: 256,
        ports: [{ hostPort: 1111, guestPort: 22 }],
        env: [['A', '1']],
        command: ['sh', '-c', 'true'],
      }),
    )
    expect(argv).toEqual([
      'run',
      '--name',
      'rz-abc12345-1',
      '-m',
      '256M',
      '-p',
      '1111:22',
      '-e',
      'A=1',
      '--from-snapshot',
      'rz-ckpt-abcdef012345',
      '--',
      'sh',
      '-c',
      'true',
    ])
    expect(argv.includes('redis:8.6-alpine')).toBe(false)
  })
})

describe('MsbCommands.snapshot (recorded upstream vectors)', () => {
  it('Should_CreateSnapshot_When_GivenSandboxAndName', () => {
    expect(MsbCommands.snapshotCreate('box-1', 'rz-ckpt-abcdef012345')).toEqual([
      'snapshot',
      'create',
      '--from',
      'box-1',
      'rz-ckpt-abcdef012345',
    ])
  })

  it('Should_AppendDestDir_When_DestDirProvided', () => {
    expect(MsbCommands.snapshotCreate('box-1', 'rz-ckpt-abcdef012345', '/cache/checkpoints')).toEqual([
      'snapshot',
      'create',
      '--from',
      'box-1',
      'rz-ckpt-abcdef012345',
      '--dest-dir',
      '/cache/checkpoints',
    ])
  })

  it('Should_RemoveSnapshot_When_Called', () => {
    expect(MsbCommands.snapshotRemove('rz-ckpt-abcdef012345')).toEqual(['snapshot', 'rm', 'rz-ckpt-abcdef012345'])
  })

  it('Should_InspectSnapshotExistence_When_Called', () => {
    expect(MsbCommands.snapshotInspect('rz-ckpt-abcdef012345')).toEqual([
      'snapshot',
      'inspect',
      'rz-ckpt-abcdef012345',
    ])
  })

  it('Should_ExportSnapshotArchive_When_GivenRefAndDest', () => {
    expect(MsbCommands.snapshotExport('rz-ckpt-abcdef012345', '/out/archive.tar.zst')).toEqual([
      'snapshot',
      'save',
      'rz-ckpt-abcdef012345',
      '/out/archive.tar.zst',
    ])
  })

  it('Should_LoadSnapshotArchive_When_GivenArchive', () => {
    expect(MsbCommands.snapshotImport('/in/archive.tar.zst')).toEqual(['snapshot', 'load', '/in/archive.tar.zst'])
  })

  it('Should_ListSnapshotsAsFormatJson_When_Called', () => {
    expect(MsbCommands.snapshotList()).toEqual(['snapshot', 'list', '--format', 'json'])
  })
})

describe('MsbCommands.copy / exec / logs / lifecycle (recorded upstream vectors)', () => {
  it('Should_CopyInHostFile_When_Called', () => {
    expect(MsbCommands.copyIn('/host/f.txt', 'box-1', '/guest/f.txt')).toEqual([
      'copy',
      '-q',
      '/host/f.txt',
      'box-1:/guest/f.txt',
    ])
  })

  it('Should_CopyOutGuestFile_When_Called', () => {
    expect(MsbCommands.copyOut('box-1', '/guest/f.txt', '/host/f.txt')).toEqual([
      'copy',
      '-q',
      'box-1:/guest/f.txt',
      '/host/f.txt',
    ])
  })

  it('Should_ExecCommandInSandbox_When_Called', () => {
    expect(MsbCommands.exec('box-1', ['echo', 'hi'])).toEqual(['exec', 'box-1', '--', 'echo', 'hi'])
  })

  it('Should_ExecAsStream_When_Called', () => {
    expect(MsbCommands.execStream('box-1', ['nc', '-l', '-p', '80'])).toEqual([
      'exec',
      '--stream',
      'box-1',
      '--',
      'nc',
      '-l',
      '-p',
      '80',
    ])
  })

  it('Should_TailLastThousandLogLines_When_Called', () => {
    expect(MsbCommands.logs('box-1')).toEqual(['logs', 'box-1', '--tail', '1000'])
  })

  it('Should_FollowLogStream_When_Called', () => {
    expect(MsbCommands.followLogs('box-1')).toEqual(['logs', 'box-1', '-f'])
  })

  it('Should_StopAndRemoveSandbox_When_Called', () => {
    expect(MsbCommands.stop('box-1')).toEqual(['stop', 'box-1'])
    expect(MsbCommands.rm('box-1')).toEqual(['rm', 'box-1'])
  })

  it('Should_ListSandboxesAsFormatJson_When_Called', () => {
    expect(MsbCommands.ls()).toEqual(['ls', '--format', 'json'])
  })

  it('Should_RemoveSingleImageReference_When_Called', () => {
    expect(MsbCommands.imageRemove('floci/floci-az:0.8.0')).toEqual(['image', 'remove', 'floci/floci-az:0.8.0'])
  })
})

describe('respawnDecision (tunnel respawn policy)', () => {
  const now = 1_000_000_000
  it('Should_RespawnImmediatelyWithZeroBackoff_When_ConnectionServed', () => {
    expect(
      respawnDecision({ closed: false, served: true, consecutiveFailures: 7, lastAttemptMs: now, nowMs: now }),
    ).toEqual({ _tag: 'reconnect', backoffMs: 0 })
  })

  it('Should_GiveUp_When_TunnelClosed', () => {
    expect(
      respawnDecision({ closed: true, served: false, consecutiveFailures: 0, lastAttemptMs: now, nowMs: now }),
    ).toEqual({ _tag: 'give-up', reason: 'closed' })
  })

  it('Should_DoubleBackoffPerFailure_When_SpawnsProduceNoTraffic', () => {
    expect(respawnDecision({ closed: false, served: false, consecutiveFailures: 0, lastAttemptMs: now, nowMs: now }))
      .toEqual({ _tag: 'reconnect', backoffMs: 200 })
    expect(respawnDecision({ closed: false, served: false, consecutiveFailures: 1, lastAttemptMs: now, nowMs: now }))
      .toEqual({ _tag: 'reconnect', backoffMs: 400 })
    expect(respawnDecision({ closed: false, served: false, consecutiveFailures: 2, lastAttemptMs: now, nowMs: now }))
      .toEqual({ _tag: 'reconnect', backoffMs: 800 })
    expect(respawnDecision({ closed: false, served: false, consecutiveFailures: 5, lastAttemptMs: now, nowMs: now }))
      .toEqual({ _tag: 'reconnect', backoffMs: 3200 })
    expect(respawnDecision({ closed: false, served: false, consecutiveFailures: 6, lastAttemptMs: now, nowMs: now }))
      .toEqual({ _tag: 'reconnect', backoffMs: 3200 })
  })

  it('Should_CountElapsedTimeTowardBackoff_When_LastAttemptIsOld', () => {
    // 800 ms backoff, but 1600 ms have elapsed since the last attempt → nothing to sleep.
    expect(
      respawnDecision({ closed: false, served: false, consecutiveFailures: 2, lastAttemptMs: now - 1600, nowMs: now }),
    ).toEqual({ _tag: 'reconnect', backoffMs: 0 })
    // 800 ms backoff, 300 ms elapsed → 500 ms remain.
    expect(
      respawnDecision({ closed: false, served: false, consecutiveFailures: 2, lastAttemptMs: now - 300, nowMs: now }),
    ).toEqual({ _tag: 'reconnect', backoffMs: 500 })
  })

  it('Should_GiveUp_When_ConsecutiveFailuresExhausted', () => {
    expect(
      respawnDecision({ closed: false, served: false, consecutiveFailures: 8, lastAttemptMs: now, nowMs: now }),
    ).toEqual({ _tag: 'give-up', reason: 'listener-unreachable' })
  })
})
