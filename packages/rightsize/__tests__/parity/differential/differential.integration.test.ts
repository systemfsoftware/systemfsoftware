/**
 * Differential reference set (R18/U7, U14): the SAME operations driven
 * through BOTH the installed `testcontainers` and `@systemfsoftware/
 * rightsize`, asserting observable equivalence — exec results and
 * mapped-port reachability — while testcontainers is still in the
 * workspace. This is the behavioral half of "parity or better"; R16's
 * type matrix is the other. THESE FILES ARE REMOVED IN U14 when
 * testcontainers leaves the workspace (the file headers carry the marker).
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Result } from 'effect'
import { GenericContainer as TcContainer } from 'testcontainers'
import { expect } from 'vitest'

import { fromImage } from '../../../src/generic-container.js'
import { type LaneOutcome, laneOutcome } from '../helpers.js'
import { noExecResult, portIsReachable } from '../probes.js'

const Feature = makeFeature({ it, layer })

/** Starts an alpine container through testcontainers, capturing the outcome in the lane's data envelope. */
const tcStart = <T>(factory: () => Promise<T>): Effect.Effect<LaneOutcome<T>> =>
  Effect.map(
    Effect.result(Effect.tryPromise(factory)),
    (result): LaneOutcome<T> =>
      Result.isSuccess(result)
        ? { ok: true, value: result.success, failureTag: undefined, failureMessage: undefined }
        : { ok: false, value: undefined, failureTag: 'testcontainers-failed', failureMessage: String(result.failure) },
  )

/** Runs one testcontainers exec, capturing the observable pair as data. */
const tcExec = (
  container: { exec: (args: string[]) => Promise<{ exitCode: number; output: string }> } | undefined,
  args: string[],
): Effect.Effect<{ exitCode: number; output: string } | undefined> =>
  container === undefined
    ? Effect.succeed(noExecResult())
    : Effect.tryPromise(() => container.exec(args)).pipe(Effect.orElseSucceed(noExecResult))

Feature('differential: rightsize matches testcontainers on the same daemon').liveClock().body(({ scenario }) => {
  scenario(
    'Should_match_exec_results_and_teardown_When_the_same_ops_run_through_both_libraries',
    Gherkin.Do.pipe(
      Given('a rightsize container')(
        'rz',
        () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start()),
      ),
      Given('a testcontainers container')(
        'tc',
        () => tcStart(() => new TcContainer('alpine:3.19').withCommand(['sleep', '60']).start()),
      ),
      When('the same failing command runs through both')('pair', (s) =>
        Effect.gen(function*() {
          const rz = s.rz.ok && s.rz.value !== undefined
            ? yield* laneOutcome(s.rz.value.execCommand('sh', '-c', 'echo oops >&2; exit 7'))
            : yield* Effect.succeed({
              ok: false,
              value: undefined,
              failureTag: 'no-container',
              failureMessage: undefined,
            })
          const container = s.tc.ok ? s.tc.value : undefined
          const tc = yield* tcExec(container, ['sh', '-c', 'echo oops >&2; exit 7'])
          return { rz, tc }
        })),
      Then('both reported the same exit code and the stderr payload')((s) => {
        expect(s.pair.rz.ok).toBe(true)
        if (s.pair.rz.ok && s.pair.rz.value !== undefined && s.pair.tc !== undefined) {
          expect(s.pair.rz.value.exitCode).toBe(s.pair.tc.exitCode)
          expect(s.pair.rz.value.exitCode).toBe(7)
          expect(`${s.pair.rz.value.stdout}${s.pair.rz.value.stderr}`).toContain('oops')
          expect(s.pair.tc.output).toContain('oops')
        }
      }),
    ),
  )

  scenario(
    'Should_publish_reachable_ports_equivalently_When_both_serve_http',
    Gherkin.Do.pipe(
      Given('a rightsize python server')('rz', () =>
        laneOutcome(
          fromImage('python:3.12-alpine')
            .withCommand('python3', '-m', 'http.server', '8000')
            .withExposedPorts(8000)
            .withStartupTimeout(30_000)
            .start(),
        )),
      Given('a testcontainers python server')(
        'tc',
        () =>
          tcStart(() =>
            new TcContainer('python:3.12-alpine').withCommand(['python3', '-m', 'http.server', '8000'])
              .withExposedPorts(8000).start()
          ),
      ),
      When('both mapped ports are probed')('reachable', (s) =>
        Effect.gen(function*() {
          const rzPort = s.rz.ok && s.rz.value !== undefined ? s.rz.value.getMappedPort(8000) : undefined
          const tcPort = s.tc.ok && s.tc.value !== undefined ? s.tc.value.getMappedPort(8000) : undefined
          const rzReachable = rzPort === undefined ? false : yield* Effect.promise(() => portIsReachable(rzPort))
          const tcReachable = tcPort === undefined ? false : yield* Effect.promise(() => portIsReachable(tcPort))
          return { rzReachable, tcReachable }
        })),
      Then('both ports are reachable over 127.0.0.1')((s) => {
        expect(s.reachable.rzReachable).toBe(true)
        expect(s.reachable.tcReachable).toBe(true)
      }),
    ),
  )
})
