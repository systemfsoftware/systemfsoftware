/**
 * Reuse identity kernel tests (R14) — hash stability, ordering invariance,
 * the deterministic name, and the registry port projection. All pure:
 * no fs, no services.
 */
import { describe, expect, it } from 'vitest'

import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { newContainerSpec } from '../../model/spec-combinators.js'
import {
  mappedRecordToBindings,
  portsToMappedRecord,
  reuseIdentityHash,
  reuseIdentityOf,
  reuseName,
} from '../hash.kernel.js'

/** A full spec — the kernel only reads the identity-relevant slice. */
const spec = (overrides: Partial<ContainerSpec> = {}): ContainerSpec => ({
  ...newContainerSpec('redis:8.6-alpine', 'rz-test'),
  ...overrides,
})

const hashChanged = (overrides: Partial<ContainerSpec>): boolean =>
  reuseIdentityHash(reuseIdentityOf(spec()), []) !== reuseIdentityHash(reuseIdentityOf(spec(overrides)), [])

describe('reuse identity hash — stability and canonicalization', () => {
  it('Should_ProduceTheSameHash_When_TheSameSpecIsHashedTwice', () => {
    const first = reuseIdentityHash(reuseIdentityOf(spec({ env: [['A', '1'], ['B', '2']] })), [])
    const second = reuseIdentityHash(reuseIdentityOf(spec({ env: [['A', '1'], ['B', '2']] })), [])
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('Should_HashTheSame_When_EnvPairOrderDiffers', () => {
    const forward = reuseIdentityHash(reuseIdentityOf(spec({ env: [['A', '1'], ['B', '2']] })), [])
    const backward = reuseIdentityHash(reuseIdentityOf(spec({ env: [['B', '2'], ['A', '1']] })), [])
    expect(forward).toBe(backward)
  })

  it('Should_HashTheSame_When_ExposedPortOrderDiffers', () => {
    const forward = reuseIdentityHash(
      reuseIdentityOf(spec({
        ports: [{ guestPort: 6379, hostPort: 0 }, { guestPort: 6380, hostPort: 0 }],
      })),
      [],
    )
    const backward = reuseIdentityHash(
      reuseIdentityOf(spec({
        ports: [{ guestPort: 6380, hostPort: 0 }, { guestPort: 6379, hostPort: 0 }],
      })),
      [],
    )
    expect(forward).toBe(backward)
  })

  it('Should_HashTheSame_When_CommandIsUnsetOrEmpty', () => {
    const unset = reuseIdentityHash(reuseIdentityOf(spec()), [])
    const empty = reuseIdentityHash(reuseIdentityOf(spec({ command: [] as ReadonlyArray<string> })), [])
    expect(unset).toBe(empty)
  })

  it('Should_ChangeTheHash_When_ImageChanges', () => {
    expect(hashChanged({ image: 'postgres:17' })).toBe(true)
  })

  it('Should_ChangeTheHash_When_EnvChanges', () => {
    expect(hashChanged({ env: [['A', '2']] })).toBe(true)
  })

  it('Should_ChangeTheHash_When_MemoryLimitChanges', () => {
    expect(hashChanged({ memoryLimitMb: 512 })).toBe(true)
  })

  it('Should_ChangeTheHash_When_DiskLimitIsSet', () => {
    expect(hashChanged({ diskLimitMb: 1024 })).toBe(true)
  })

  it('Should_ChangeTheHash_When_TmpfsRootIsSet', () => {
    expect(hashChanged({ tmpfsRootMb: 256 })).toBe(true)
  })

  it('Should_ChangeTheHash_When_NetworkDisabledFlips', () => {
    expect(hashChanged({ networkDisabled: true })).toBe(true)
  })

  it('Should_LeaveTheHashAlone_When_OnlyTheNameDiffers', () => {
    const named = reuseIdentityHash(reuseIdentityOf(spec({ name: 'rz-reuse-hello' })), [])
    const other = reuseIdentityHash(reuseIdentityOf(spec({ name: 'rz-reuse-world' })), [])
    expect(named).toBe(other)
  })
})

describe('reuse identity — copy content digests', () => {
  it('Should_ChangeTheHash_When_CopyContentDigestsDiffer', () => {
    const copied = reuseIdentityOf(spec({ mounts: [{ hostPath: '/tmp/a', guestPath: '/a', readOnly: false }] }))
    const digestA = reuseIdentityHash(copied, [{ guestPath: '/a', sha256: 'a'.repeat(64) }])
    const digestB = reuseIdentityHash(copied, [{ guestPath: '/a', sha256: 'b'.repeat(64) }])
    expect(digestA).not.toBe(digestB)
  })

  it('Should_HashTheSame_When_CopyDigestOrderDiffers', () => {
    const copied = reuseIdentityOf(spec({
      mounts: [
        { hostPath: '/tmp/x', guestPath: '/b', readOnly: false },
        { hostPath: '/tmp/y', guestPath: '/a', readOnly: false },
      ],
    }))
    const forward = reuseIdentityHash(copied, [
      { guestPath: '/a', sha256: '1'.repeat(64) },
      { guestPath: '/b', sha256: '2'.repeat(64) },
    ])
    const backward = reuseIdentityHash(copied, [
      { guestPath: '/b', sha256: '2'.repeat(64) },
      { guestPath: '/a', sha256: '1'.repeat(64) },
    ])
    expect(forward).toBe(backward)
  })
})

describe('reuseName — the deterministic container name', () => {
  it('Should_DeriveTheName_When_GivenTheHash', () => {
    expect(reuseName('abcdef1234567890')).toBe('rz-reuse-abcdef123456')
  })

  it('Should_BeDeterministic_When_TheSameHashIsPresentedTwice', () => {
    const hash = reuseIdentityHash(reuseIdentityOf(spec()), [])
    expect(reuseName(hash)).toBe(reuseName(hash))
  })
})

describe('registry port projection', () => {
  it('Should_RoundTripBindings_When_GoingThroughTheRecord', () => {
    const bindings = [
      { guestPort: 6379, hostPort: 41173 },
      { guestPort: 6380, hostPort: 41174 },
    ]
    const record = portsToMappedRecord(bindings)
    expect(record['6379']).toBe(41173)
    expect(record['6380']).toBe(41174)
    expect(mappedRecordToBindings(record)).toEqual(bindings)
  })
})
