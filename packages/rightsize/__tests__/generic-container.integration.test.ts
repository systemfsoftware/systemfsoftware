/**
 * The GenericContainer facade BDD suite — the fluent immutable chain and the
 * running-container dual surface: every `with*` returns a NEW value leaving
 * the original untouched, the carried spec is byte-identical to what the
 * spec combinators produce, and `start()` drives the real launch cell (the
 * executor under test) over the recording doubles. GenericContainer is
 * whitelisted for `ban-classes` by the harness (the parent's
 * oxlint.config.ts).
 */
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, type Scope } from 'effect'
import { expect } from 'vitest'

import { fromImage, GenericContainer, type RunningContainer, toRunningContainer } from '../src/generic-container.js'
import { launchContainer } from '../src/lifecycle/launch.js'
import { withCommand, withEnv, withNetwork } from '../src/model/spec-combinators.js'
import { SandboxRuntime, VirtualNetworks } from '../src/runtime/runtime.js'
import {
  makeRecordingNetworks,
  makeRecordingRuntime,
  type RecordingNetworks,
  type RecordingRuntime,
  testEnvironmentLayer,
} from './helpers.js'

interface Lineup {
  readonly runtime: RecordingRuntime
  readonly networks: RecordingNetworks
  readonly cacheDir: string
}

let cacheSequence = 0

const freshLineup = (): Effect.Effect<Lineup> =>
  Effect.sync(() => ({
    runtime: makeRecordingRuntime(),
    networks: makeRecordingNetworks(),
    cacheDir: `/tmp/rightsize-generic-cache-${++cacheSequence}`,
  }))

const envLayerFor = (lineup: Lineup) =>
  Layer.mergeAll(
    testEnvironmentLayer(lineup.cacheDir, 'off'),
    Layer.succeed(SandboxRuntime, lineup.runtime.service),
    Layer.succeed(VirtualNetworks, lineup.networks.service),
  )

/** Starts the facade value in the CALLER'S scope (the gherkin scenario supplies it) — the container stays alive for the step's lifetime, and teardown runs when the step's scope closes. */
const startScoped = (
  container: GenericContainer,
  lineup: Lineup,
): Effect.Effect<RunningContainer, unknown, Scope.Scope> =>
  container.start({ hygiene: { cacheDir: lineup.cacheDir } }).pipe(Effect.provide(envLayerFor(lineup)))

const Feature = makeFeature({ it, layer })

Feature('generic-container facade builds immutable specs and starts through the launch cell').body(({ scenario }) => {
  scenario(
    'leaves the original untouched when chained',
    Gherkin.Do.pipe(
      When('a base container is chained with env, command, and a network')('pair', () => {
        const base = fromImage('redis:8.6-alpine')
        const chained = base.withEnv('REDIS_ARGS', '--maxmemory 64mb').withCommand(
          'redis-server',
          '--appendonly',
          'yes',
        ).withNetwork('net-facade')
        return Effect.sync(() => ({ base: base.spec, chained: chained.spec }))
      }),
      Then('the original spec carries none of the chained fragments')((s) => {
        expect(s.pair.base.env).toEqual([])
        expect(s.pair.base.command).toBeUndefined()
        expect(s.pair.base.networkId).toBeUndefined()
      }),
      And('the chained spec matches the combinator mapping exactly')((s) => {
        const base = fromImage('redis:8.6-alpine').spec
        expect(s.pair.chained.env).toEqual(withEnv(base, 'REDIS_ARGS', '--maxmemory 64mb').env)
        expect(s.pair.chained.command).toEqual(withCommand(base, 'redis-server', '--appendonly', 'yes').command)
        expect(s.pair.chained.networkId).toEqual(withNetwork(base, 'net-facade').networkId)
      }),
    ),
  )

  scenario(
    'starts a container and exposes the running surface',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a port-exposed container is launched through the executor and wrapped')('running', (s) =>
        launchContainer(
          { ...fromImage('redis:8.6-alpine').spec, name: 'rz-facade' },
          {
            hygiene: { cacheDir: s.setup.cacheDir },
            wait: { portProbe: () => Effect.succeed(true) },
          },
        ).pipe(
          Effect.map(toRunningContainer),
          Effect.provide(envLayerFor(s.setup)),
        ) as unknown as Effect.Effect<RunningContainer, unknown, Scope.Scope>),
      Then('the backend create and start ran')((s) => {
        expect(s.running.handle.id).toMatch(/^cid-/)
        expect(s.setup.runtime.calls.some((call) => call.startsWith('create:'))).toBe(true)
        expect(s.setup.runtime.calls.some((call) => call.startsWith('start:'))).toBe(true)
      }),
      And('the host surface is reported')((s) => {
        expect(s.running.getHost()).toBe('127.0.0.1')
      }),
    ),
  )

  scenario(
    'stop is shared with the executor and idempotent',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a started container is stopped twice')('removes', (s) =>
        Effect.gen(function*() {
          const running = yield* startScoped(fromImage('redis:8.6-alpine'), s.setup)
          yield* running.stop
          yield* running.stop
          return s.setup.runtime.calls.filter((call) => call.startsWith('remove:')).length
        }).pipe(Effect.provide(envLayerFor(s.setup)))),
      Then('exactly one backend remove ran')((s) => {
        expect(s.removes).toBe(1)
      }),
    ),
  )

  scenario(
    'exec runs through the runtime seam',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a started container runs a one-shot exec')('exec', (s) =>
        Effect.gen(function*() {
          const running = yield* startScoped(fromImage('redis:8.6-alpine'), s.setup)
          const result = yield* running.execCommand('redis-cli', 'INFO')
          return result
        }).pipe(Effect.provide(envLayerFor(s.setup)))),
      Then('the exec verdict returned')((s) => {
        expect(s.exec.exitCode).toBe(0)
        expect(s.setup.runtime.calls.filter((call) => call.startsWith('exec:'))).toHaveLength(1)
      }),
    ),
  )
})
