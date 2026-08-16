/**
 * Docker `ImageRegistry` adapter tests: skip-pull-when-present, the pull
 * URL's repo/tag split, the `X-Registry-Auth` header on authenticated
 * pulls, the terminal error-frame classification, and loud HTTP failures.
 * No real registry traffic — everything runs against the scripted socket.
 * Promise-chain test callbacks (no `async`), per the package's effect
 * tsconfig profile.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { BackendError } from '../../model/errors.js'
import { makeDockerClient } from '../client.js'
import { makeDockerImages } from '../images.adapter.js'
import { withDaemon } from './fake-daemon.js'

const imagesFor = (socketPath: string) => makeDockerImages(makeDockerClient(socketPath))

describe('pull', () => {
  it('Should_SkipThePull_When_TheImageIsAlreadyPresent', () =>
    withDaemon(
      [{ status: 200, body: '{}' }],
      (daemon) =>
        Effect.runPromise(imagesFor(daemon.socketPath).pull('redis:8.6-alpine')).then(() => {
          expect(daemon.requests).toHaveLength(1)
          expect(daemon.requests[0]?.url).toBe('/images/redis%3A8.6-alpine/json')
        }),
    ))

  it('Should_PullWithTheSplitRepoTag_When_TheImageIsMissing', () =>
    withDaemon(
      [
        { status: 404, body: 'no such image' },
        { status: 200, body: '{"status":"Status: Downloaded newer image"}\n' },
      ],
      (daemon) =>
        Effect.runPromise(imagesFor(daemon.socketPath).pull('ghcr.io/org/redis:7-alpine')).then(() => {
          expect(daemon.requests[1]?.method).toBe('POST')
          expect(decodeURIComponent(daemon.requests[1]?.url ?? '')).toBe(
            '/images/create?fromImage=ghcr.io/org/redis&tag=7-alpine',
          )
        }),
    ))

  it('Should_CarryTheBase64RegistryAuthHeader_When_AuthIsConfigured', () =>
    withDaemon(
      [
        { status: 404, body: 'no such image' },
        { status: 200, body: '{"status":"Status: Downloaded newer image"}\n' },
      ],
      (daemon) => {
        const authed = makeDockerImages(makeDockerClient(daemon.socketPath), {
          username: 'ci',
          password: 's3cret',
          serveraddress: 'registry.example.com',
        })
        return Effect.runPromise(authed.pull('registry.example.com/team/app:1.0.0')).then(() => {
          const authHeader = daemon.requests[1]?.headers['x-registry-auth']
          expect(authHeader).toBeDefined()
          const decoded = JSON.parse(Buffer.from(authHeader ?? '', 'base64').toString('utf8')) as Record<string, string>
          expect(decoded).toEqual({ username: 'ci', password: 's3cret', serveraddress: 'registry.example.com' })
        })
      },
    ))

  it('Should_FailWithTheDaemonsText_When_TheProgressStreamEndsInAnErrorFrame', () =>
    withDaemon(
      [
        { status: 404, body: 'no such image' },
        {
          status: 200,
          body: JSON.stringify({
            error: 'denied: requested access to the resource is denied',
            errorDetail: { message: 'denied: requested access to the resource is denied' },
          }) + '\n',
        },
      ],
      (daemon) =>
        Effect.runPromise(imagesFor(daemon.socketPath).pull('registry.example.com/team/app:1.0.0')).then(
          () => Promise.reject(new Error('expected a pull failure')),
          (error: unknown) => {
            expect(error).toBeInstanceOf(BackendError)
          },
        ),
    ))

  it('Should_FailLoudly_When_ThePullHttpStatusIsAnError', () =>
    withDaemon(
      [
        { status: 404, body: 'no such image' },
        { status: 500, body: 'registry unreachable' },
      ],
      (daemon) =>
        Effect.runPromise(imagesFor(daemon.socketPath).pull('redis:latest')).then(
          () => Promise.reject(new Error('expected a pull failure')),
          (error: unknown) => {
            expect(error).toBeInstanceOf(BackendError)
          },
        ),
    ))
})

describe('inspect', () => {
  it('Should_ReportPresent_When_TheImageAnswers200', () =>
    withDaemon(
      [{ status: 200, body: '{}' }],
      (daemon) =>
        Effect.runPromise(imagesFor(daemon.socketPath).inspect('redis:latest')).then((present) => {
          expect(present).toBe(true)
        }),
    ))

  it('Should_ReportAbsent_When_TheImageAnswers404', () =>
    withDaemon(
      [{ status: 404, body: 'no such image' }],
      (daemon) =>
        Effect.runPromise(imagesFor(daemon.socketPath).inspect('redis:latest')).then((present) => {
          expect(present).toBe(false)
        }),
    ))
})
