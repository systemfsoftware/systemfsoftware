/**
 * Docker `VirtualNetworks` adapter tests: idempotent ensure (lookup-then-
 * create), create when missing, by-name fallback on removal, and the
 * install-links no-op (docker's native bridge needs no tunnel emulation).
 * Promise-chain test callbacks (no `async`), per the package's effect
 * tsconfig profile.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeDockerClient } from '../client.js'
import { makeDockerNetworks } from '../networks.adapter.js'
import { withDaemon } from './fake-daemon.js'

const networksFor = (socketPath: string) => makeDockerNetworks(makeDockerClient(socketPath))

describe('ensureNetwork', () => {
  it('Should_LookUpByNameAndSkipCreate_When_TheNetworkAlreadyExists', () =>
    withDaemon(
      [{ status: 200, body: JSON.stringify([{ Id: 'daemon-net-1' }]) }],
      (daemon) =>
        Effect.runPromise(networksFor(daemon.socketPath).ensureNetwork('rz-net-abc12345')).then(() => {
          expect(daemon.requests).toHaveLength(1)
          expect(daemon.requests[0]?.method).toBe('GET')
          expect(daemon.requests[0]?.url).toContain('/networks?filters=')
          expect(decodeURIComponent(daemon.requests[0]?.url ?? '')).toContain('rz-net-abc12345')
        }),
    ))

  it('Should_CreateTheNetwork_When_TheLookupComesUpEmpty', () =>
    withDaemon(
      [
        { status: 200, body: '[]' },
        { status: 201, body: JSON.stringify({ Id: 'net-created' }) },
      ],
      (daemon) =>
        Effect.runPromise(networksFor(daemon.socketPath).ensureNetwork('rz-net-abc12345')).then(() => {
          expect(daemon.requests[1]?.method).toBe('POST')
          expect(daemon.requests[1]?.url).toBe('/networks/create')
          expect(JSON.parse(daemon.requests[1]?.body ?? '{}')).toEqual({ Name: 'rz-net-abc12345' })
        }),
    ))

  it('Should_CallTheDaemonOnlyOnce_When_EnsuresRepeatTheSameName', () =>
    withDaemon([{ status: 200, body: JSON.stringify([{ Id: 'net-1' }]) }], (daemon) => {
      const networks = networksFor(daemon.socketPath)
      return Effect.runPromise(networks.ensureNetwork('rz-net-abc12345'))
        .then(() => Effect.runPromise(networks.ensureNetwork('rz-net-abc12345')))
        .then(() => {
          expect(daemon.requests).toHaveLength(1) // the second ensure hit the in-memory cache
        })
    }))
})

describe('removeNetwork', () => {
  it('Should_DeleteThroughTheByNameLookup_When_ThisInstanceNeverEnsuredIt', () =>
    withDaemon(
      [
        { status: 200, body: JSON.stringify([{ Id: 'daemon-net-abc' }]) },
        { status: 204, body: '' },
      ],
      (daemon) =>
        Effect.runPromise(networksFor(daemon.socketPath).removeNetwork('rz-otherprocess-net')).then(() => {
          expect(daemon.requests).toHaveLength(2)
          expect(daemon.requests[0]?.method).toBe('GET')
          expect(daemon.requests[1]?.method).toBe('DELETE')
          expect(daemon.requests[1]?.url).toBe('/networks/daemon-net-abc')
        }),
    ))

  it('Should_BeASilentNoOp_When_TheDaemonKnowsNoSuchNetwork', () =>
    withDaemon(
      [{ status: 200, body: '[]' }],
      (daemon) =>
        Effect.runPromise(networksFor(daemon.socketPath).removeNetwork('rz-never-existed-net')).then(() => {
          expect(daemon.requests).toHaveLength(1) // list only; no DELETE for a network never found
        }),
    ))
})

describe('installNetworkLinks', () => {
  it('Should_BeANoop_When_DockerProvidesNativeBridgeNetworks', () =>
    withDaemon([], (daemon) => {
      const handle = {
        id: 'c1',
        spec: {
          name: 'rz-x-1',
          image: 'alpine',
          env: [],
          ports: [],
          mounts: [],
          aliases: [],
          runId: 'x',
          keepAlive: false,
          networkDisabled: false,
          requireIsolation: false,
          waitStrategy: { _tag: 'ForPort' } as const,
        },
      }
      return Effect.runPromise(networksFor(daemon.socketPath).installNetworkLinks(handle, [])).then(() => {
        expect(daemon.requests).toHaveLength(0)
      })
    }))
})
