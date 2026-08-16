/**
 * `buildCreateBody` acceptance tests: loopback-pinned port bindings, the
 * reaper/reuse labels, mounts, command, memory ceiling, and the deliberate
 * msb-only no-op fields (behavioral reference: upstream rightsize-node's
 * `backend.test.ts` `buildCreateBody` cases).
 */
import { describe, expect, it } from 'vitest'
import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { buildCreateBody } from '../container-create.kernel.js'

const baseSpec = (overrides: Partial<ContainerSpec> = {}): ContainerSpec => ({
  name: 'rz-deadbeef-1',
  image: 'alpine:3.19',
  env: [],
  ports: [],
  mounts: [],
  aliases: [],
  runId: 'deadbeef',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
  ...overrides,
})

describe('buildCreateBody', () => {
  it('Should_BindEveryPortOnLoopback_When_SpecCarriesPortBindings', () => {
    const body = buildCreateBody(
      baseSpec({ ports: [{ hostPort: 49213, guestPort: 6379 }, { hostPort: 49214, guestPort: 8080 }] }),
    )
    expect(body.ExposedPorts).toEqual({ '6379/tcp': {}, '8080/tcp': {} })
    expect(body.HostConfig.PortBindings).toEqual({
      '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '49213' }],
      '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '49214' }],
    })
    expect(body.HostConfig.ExtraHosts).toEqual(['host.docker.internal:host-gateway'])
  })

  it('Should_CarryTheRunIdReaperLabel_When_TheSpecIsANormalContainer', () => {
    expect(buildCreateBody(baseSpec()).Labels).toEqual({ 'dev.rightsize.runId': 'deadbeef' })
  })

  it('Should_CarryTheReuseLabelInstead_When_KeepAlive', () => {
    const labels = buildCreateBody(baseSpec({ keepAlive: true, name: 'rz-reuse-abc123abc123' })).Labels
    expect(Object.keys(labels)).toEqual(['dev.rightsize.reuse'])
    expect(labels['dev.rightsize.reuse']).toMatch(/^[0-9a-f]{12}$/)
  })

  it('Should_RenderMounts_When_SpecCarriesReadOnlyAndReadWriteBinds', () => {
    const body = buildCreateBody(
      baseSpec({
        mounts: [
          { hostPath: '/host/cache', guestPath: '/var/cache', readOnly: true },
          { hostPath: '/host/data', guestPath: '/var/data', readOnly: false },
        ],
      }),
    )
    expect(body.HostConfig.Binds).toEqual(['/host/cache:/var/cache:ro', '/host/data:/var/data:rw'])
  })

  it('Should_CarryTheCommand_When_SpecOverridesIt', () => {
    expect(buildCreateBody(baseSpec({ command: ['redis-server', '--maxmemory', '64mb'] })).Cmd).toEqual([
      'redis-server',
      '--maxmemory',
      '64mb',
    ])
  })

  it('Should_ConvertTheMemoryCeilingToBytes_When_SpecSetsIt', () => {
    expect(buildCreateBody(baseSpec({ memoryLimitMb: 64 })).HostConfig.Memory).toBe(64 * 1024 * 1024)
  })

  it('Should_LeaveMsbOnlyOptionsUnread_When_TheyAreSet', () => {
    const withMsbOnly = baseSpec({ diskLimitMb: 1024, tmpfsRootMb: 256, networkDisabled: true })
    expect(buildCreateBody(withMsbOnly)).toEqual(buildCreateBody(baseSpec()))
  })

  it('Should_JoinEnvPairs_When_SpecCarriesEnvironment', () => {
    expect(buildCreateBody(baseSpec({ env: [['REDIS_AOF_ENABLED', 'no'], ['PORT', '6379']] })).Env).toEqual([
      'REDIS_AOF_ENABLED=no',
      'PORT=6379',
    ])
  })
})
