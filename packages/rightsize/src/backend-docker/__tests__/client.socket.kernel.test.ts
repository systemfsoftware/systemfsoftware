/**
 * Client transport tests: the unix-socket-only dialing contract (R9) and the
 * scripted-socket request/stream behavior. The `tcp://` non-goal is refused
 * by the pure seam, and a client constructed over a fake daemon socket
 * drives real `node:http` traffic through one connection per request.
 *
 * Test callbacks are promise-returning (no `async` keyword): this package's
 * effect tsconfig profile bans async function declarations even in tests.
 */
import { Effect, Option } from 'effect'
import * as Result from 'effect/Result'
import { describe, expect, it } from 'vitest'
import { UnsupportedDockerHostError } from '../../runtime/discovery/discovery.adapter.js'
import { dockerClientFromEnv, makeDockerClient, socketPathFromDockerHost } from '../client.js'
import { withDaemon } from './fake-daemon.js'

describe('socketPathFromDockerHost', () => {
  it('Should_ResolveUnixForms_When_DockerHostNamesASocket', () => {
    expect(Result.isSuccess(socketPathFromDockerHost(undefined as string | undefined))).toBe(true)
    // Unset DOCKER_HOST means the daemon's default socket, never a failure.
    expect(Result.getOrThrow(socketPathFromDockerHost(undefined as string | undefined))).toBe('/var/run/docker.sock')
    expect(Result.getOrThrow(socketPathFromDockerHost('unix:///run/podman/podman.sock'))).toBe(
      '/run/podman/podman.sock',
    )
    expect(Result.getOrThrow(socketPathFromDockerHost('/var/run/docker.sock'))).toBe('/var/run/docker.sock')
  })

  it('Should_RefuseTcpHostWithTheNonGoalError_When_DockerHostNamesATcpTarget', () => {
    const result = socketPathFromDockerHost('tcp://localhost:2375')
    expect(Result.isFailure(result)).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(result))).toBeInstanceOf(UnsupportedDockerHostError)
    expect(Option.getOrThrow(Result.getFailure(result)).dockerHost).toBe('tcp://localhost:2375')
  })

  it('Should_RefuseBareHostStrings_When_TheyCannotResolveToASocket', () => {
    expect(Result.isFailure(socketPathFromDockerHost('localhost:2375'))).toBe(true)
  })
})

describe('DockerClient.request (buffered unary)', () => {
  it('Should_RecordAndReturnTheBufferedBody_When_TheDaemonAnswers', () =>
    withDaemon([{ status: 200, body: JSON.stringify({ Id: 'abc123' }) }], (daemon) => {
      const client = makeDockerClient(daemon.socketPath)
      return Effect.runPromise(client.request('GET', '/containers/abc123/json')).then((resp) => {
        expect(resp.status).toBe(200)
        expect(resp.body.toString()).toBe(JSON.stringify({ Id: 'abc123' }))
        expect(daemon.requests).toHaveLength(1)
        expect(daemon.requests[0]?.method).toBe('GET')
        expect(daemon.requests[0]?.url).toBe('/containers/abc123/json')
      })
    }))

  it('Should_SendTheJsonBodyWithContentLength_When_Posting', () =>
    withDaemon([{ status: 201, body: JSON.stringify({ Id: 'c42' }) }], (daemon) => {
      const client = makeDockerClient(daemon.socketPath)
      return Effect.runPromise(client.request('POST', '/containers/create?name=x', '{"Image":"redis"}')).then(() => {
        expect(daemon.requests[0]?.headers['content-length']).toBe('{"Image":"redis"}'.length.toString())
        expect(daemon.requests[0]?.headers['content-type']).toBe('application/json')
        expect(daemon.requests[0]?.body).toBe('{"Image":"redis"}')
      })
    }))
})

describe('DockerClient.requestStream', () => {
  it('Should_LeaveTheBodyStreaming_When_RequestStreamReturnsHeaders', () =>
    withDaemon([{ status: 200, body: Buffer.from([1, 0, 0, 0, 0, 0, 0, 2, 0x61, 0x62]) }], (daemon) => {
      const client = makeDockerClient(daemon.socketPath)
      return Effect.runPromise(client.requestStream('GET', '/containers/c42/logs?stdout=1')).then((stream) => {
        expect(stream.status).toBe(200)
        const chunks: Buffer[] = []
        const { promise, resolve } = Promise.withResolvers<void>()
        stream.body.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.body.on('end', resolve)
        return promise.then(() => {
          expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 0, 0, 0, 0, 0, 0, 2, 0x61, 0x62]))
        })
      })
    }))
})

describe('tcp:// DOCKER_HOST never reaches the transport', () => {
  it('Should_RefuseFromEnv_When_TheTcpHostNamesANonSocket', () => {
    const previous = process.env['DOCKER_HOST']
    process.env['DOCKER_HOST'] = 'tcp://localhost:2375'
    try {
      const fromEnv = dockerClientFromEnv()
      expect(Result.isFailure(fromEnv)).toBe(true)
      expect(Option.getOrThrow(Result.getFailure(fromEnv))).toBeInstanceOf(UnsupportedDockerHostError)
    } finally {
      if (previous === undefined) {
        delete process.env['DOCKER_HOST']
      } else {
        process.env['DOCKER_HOST'] = previous
      }
    }
  })
})
