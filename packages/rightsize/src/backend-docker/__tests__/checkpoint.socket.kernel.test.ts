/**
 * Docker `CheckpointStore` adapter tests: the commit URL's repo/tag split,
 * the hasCheckpoint 200/404/error contract, and best-effort removal. The
 * save/load shell-outs assert their argv through `cli.shellout.test.ts` —
 * they are not executed here (no real docker).
 * Promise-chain test callbacks (no `async`), per the package's effect
 * tsconfig profile.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { BackendError } from '../../model/errors.js'
import { makeDockerCheckpoints } from '../checkpoint.adapter.js'
import { makeDockerClient } from '../client.js'
import { withDaemon } from './fake-daemon.js'

const checkpointsFor = (socketPath: string) => makeDockerCheckpoints(makeDockerClient(socketPath))

const handle = {
  id: 'container-id-1',
  spec: {
    name: 'rz-x-1',
    image: 'x',
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

describe('createCheckpoint', () => {
  it('Should_CommitTheContainerToTheSplitRepoAndTag_When_TheRefIsDockerShaped', () =>
    withDaemon(
      [{ status: 201, body: JSON.stringify({ Id: 'sha256:abc' }) }],
      (daemon) =>
        Effect.runPromise(
          checkpointsFor(daemon.socketPath).createCheckpoint(handle, 'rightsize/checkpoint:abcdef012345'),
        ).then(
          () => {
            expect(daemon.requests).toHaveLength(1)
            expect(daemon.requests[0]?.method).toBe('POST')
            expect(decodeURIComponent(daemon.requests[0]?.url ?? '')).toContain('container=container-id-1')
            expect(decodeURIComponent(daemon.requests[0]?.url ?? '')).toContain('repo=rightsize/checkpoint')
            expect(decodeURIComponent(daemon.requests[0]?.url ?? '')).toContain('tag=abcdef012345')
          },
        ),
    ))
})

describe('hasCheckpoint', () => {
  it('Should_ReturnTrue_When_TheImageInspects200', () =>
    withDaemon(
      [{ status: 200, body: '{}' }],
      (daemon) =>
        Effect.runPromise(checkpointsFor(daemon.socketPath).hasCheckpoint('rightsize/checkpoint:abcdef012345')).then(
          (present) => {
            expect(present).toBe(true)
            expect(daemon.requests[0]?.url).toBe('/images/rightsize%2Fcheckpoint%3Aabcdef012345/json')
          },
        ),
    ))

  it('Should_ReturnFalse_When_TheImageIsAbsent404', () =>
    withDaemon(
      [{ status: 404, body: 'no such image' }],
      (daemon) =>
        Effect.runPromise(checkpointsFor(daemon.socketPath).hasCheckpoint('rightsize/checkpoint:deadbeef000000')).then(
          (present) => {
            expect(present).toBe(false)
          },
        ),
    ))

  it('Should_FailLoudly_When_TheProbeHitsAnUnexpectedStatus', () =>
    withDaemon(
      [{ status: 500, body: 'daemon wedged' }],
      (daemon) =>
        Effect.runPromise(checkpointsFor(daemon.socketPath).hasCheckpoint('rightsize/checkpoint:abc')).then(
          () => Promise.reject(new Error('expected a probe failure')),
          (error: unknown) => {
            expect(error).toBeInstanceOf(BackendError)
          },
        ),
    ))
})

describe('removeCheckpoint', () => {
  it('Should_DeleteBestEffort_When_NotFoundCountsAsSuccess', () =>
    withDaemon(
      [{ status: 204, body: '' }],
      (daemon) =>
        Effect.runPromise(checkpointsFor(daemon.socketPath).removeCheckpoint('rightsize/checkpoint:abc')).then(() => {
          expect(daemon.requests[0]?.method).toBe('DELETE')
          expect(daemon.requests[0]?.url).toBe('/images/rightsize%2Fcheckpoint%3Aabc')
        }),
    ))
})
