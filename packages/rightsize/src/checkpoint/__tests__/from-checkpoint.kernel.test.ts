/**
 * `fromCheckpoint` restore wiring tests (R14) — the restored spec carries
 * the checkpoint ref as its image + self-ref, seeds env/command/ports/
 * memory from the captured spec, and the launch seam exposes the source
 * backend for the pre-I/O mismatch gate. Pure.
 */
import { describe, expect, it } from 'vitest'

import {
  newContainerSpec,
  withCommand,
  withEnv,
  withExposedPorts,
  withMemoryLimit,
} from '../../model/spec-combinators.js'
import type { Checkpoint } from '../checkpoint.js'
import { fromCheckpoint, restoreFromCheckpoint } from '../from-checkpoint.js'

const checkpointOf = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
  ref: 'rightsize/checkpoint:seeded-db',
  backend: 'docker',
  spec: withMemoryLimit(
    withCommand(
      withExposedPorts(withEnv(newContainerSpec('postgres:17', 'rz-source'), 'PGPORT', '5432'), 5432),
      'postgres',
    ),
    512,
  ),
  ...overrides,
})

describe('fromCheckpoint — the restore spec wiring', () => {
  it('Should_BootFromTheCheckpointRef_When_TheRestoreIsLaunched', () => {
    const spec = fromCheckpoint(checkpointOf())
    expect(spec.image).toBe('rightsize/checkpoint:seeded-db')
    expect(spec.checkpointRef).toBe('rightsize/checkpoint:seeded-db')
  })

  it('Should_CarryTheCapturedEnvCommandPortsAndMemory_When_Restored', () => {
    const spec = fromCheckpoint(checkpointOf())
    expect(spec.env).toEqual([['PGPORT', '5432']])
    expect(spec.command).toEqual(['postgres'])
    expect(spec.ports).toEqual([{ hostPort: 0, guestPort: 5432 }])
    expect(spec.memoryLimitMb).toBe(512)
  })

  it('Should_NotCarryTheCapturedHostPortsOrRunIdentity_When_Restored', () => {
    const spec = fromCheckpoint(checkpointOf())
    expect(spec.ports.every((binding) => binding.hostPort === 0)).toBe(true)
    expect(spec.runId).toBe('')
  })

  it('Should_ExposeTheSourceBackend_When_TheLaunchSeamIsBuilt', () => {
    const launch = restoreFromCheckpoint(checkpointOf())
    expect(launch.sourceBackend).toBe('docker')
    expect(launch.spec.checkpointRef).toBe('rightsize/checkpoint:seeded-db')
  })
})
