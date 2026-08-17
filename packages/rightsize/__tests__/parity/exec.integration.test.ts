/**
 * Exec contract (F3), ported from upstream `test/it/contract.test.ts` and
 * extended: env via the facade and via the exec request, exit codes +
 * separated stderr, `workingDir`, the exit-127-with-empty-stdout
 * missing-WorkingDir trap (documented as data), and concurrent exec from
 * one handle. All through the real docker backend.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage, toRunningContainer } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.js'
import type { ExecResult } from '../../src/model/container-spec.js'
import { laneOutcome, outcomeFailure } from './helpers.js'

const Feature = makeFeature({ it, layer })

Feature('the exec contract runs real commands through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'Should_surface_container_env_to_an_exec_When_inherited',
    Gherkin.Do.pipe(
      Given('a container carrying an env var')(
        'container',
        () =>
          laneOutcome(
            fromImage('alpine:3.19').withEnv('CONTRACT_VAR', 'hello-contract').withCommand('sleep', '60').start(),
          ),
      ),
      When('an exec reads the var')('exec', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.execCommand('sh', '-c', 'echo $CONTRACT_VAR'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('the value is visible')((s) => {
        expect(s.exec.ok).toBe(true)
        if (s.exec.ok && s.exec.value !== undefined) {
          expect(s.exec.value.exitCode).toBe(0)
          expect(s.exec.value.stdout.trim()).toBe('hello-contract')
        }
      }),
    ),
  )

  scenario(
    'Should_report_real_exit_codes_and_stderr_When_a_command_fails',
    Gherkin.Do.pipe(
      Given('a container')('container', () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start())),
      When('a command exits 7 and writes stderr')('exec', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.execCommand('sh', '-c', 'echo oops >&2; exit 7'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('the exit code and stderr are preserved')((s) => {
        expect(s.exec.ok).toBe(true)
        if (s.exec.ok && s.exec.value !== undefined) {
          expect(s.exec.value.exitCode).toBe(7)
          expect(s.exec.value.stderr).toContain('oops')
        }
      }),
    ),
  )

  scenario(
    'Should_answer_in_the_requested_working_directory_When_exec_carries_one',
    Gherkin.Do.pipe(
      Given('a container')('container', () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start())),
      When('an exec with workingDir /tmp runs pwd')('exec', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            s.container.value.exec({ command: ['sh', '-c', 'pwd'], env: [], workingDir: '/tmp' }),
          )
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('pwd reported /tmp')((s) => {
        expect(s.exec.ok).toBe(true)
        if (s.exec.ok && s.exec.value !== undefined) {
          expect(s.exec.value.exitCode).toBe(0)
          expect(s.exec.value.stdout.trim()).toBe('/tmp')
        }
      }),
    ),
  )

  scenario(
    'Should_pass_exec_level_environment_When_requested',
    Gherkin.Do.pipe(
      Given('a container')('container', () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start())),
      When('an exec with env reads it')('exec', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            s.container.value.exec({ command: ['sh', '-c', 'echo $EXEC_VAR'], env: [['EXEC_VAR', 'exec-value']] }),
          )
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('the exec-level env is visible')((s) => {
        expect(s.exec.ok).toBe(true)
        if (s.exec.ok && s.exec.value !== undefined) {
          expect(s.exec.value.stdout.trim()).toBe('exec-value')
        }
      }),
    ),
  )

  scenario(
    'Should_never_cleanly_succeed_When_the_exec_working_directory_is_missing',
    Gherkin.Do.pipe(
      Given('a container lauched through the executor')(
        'container',
        () =>
          laneOutcome(
            launchContainer(fromImage('alpine:3.19').withCommand('sleep', '60').spec).pipe(
              Effect.map(toRunningContainer),
            ),
          ),
      ),
      When('an exec targets a nonexistent working directory')(
        'trap',
        (s) =>
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(
              s.container.value.exec({ command: ['sh', '-c', 'pwd'], env: [], workingDir: '/rz-no-such-dir-xyz' }),
            )
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage)),
      ),
      Then('the missing-WorkingDir trap is documented as data: never a clean success')((s) => {
        if (s.trap.ok && s.trap.value !== undefined) {
          expect(s.trap.value.exitCode).not.toBe(0)
          return
        }
        expect(s.trap.ok).toBe(false)
        expect(s.trap.failureTag).toBe('BackendError')
        expect(s.trap.failureMessage ?? '').toContain('no-such-dir')
      }),
    ),
  )

  scenario(
    'Should_run_concurrently_from_one_handle_When_six_execs_go_in_parallel',
    Gherkin.Do.pipe(
      Given('a container')('container', () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start())),
      When('six execs run concurrently')('results', (s) => {
        const container = s.container.ok ? s.container.value : undefined
        return container === undefined
          ? Effect.succeed([])
          : Effect.all(
            Array.from({ length: 6 }, (_, i) => laneOutcome(container.execCommand('sh', '-c', `echo exec-${i}`))),
            { concurrency: 6 },
          )
      }),
      Then('every exec returned its own correct result')((s) => {
        expect(s.results).toHaveLength(6)
        s.results.forEach((result, index) => {
          expect(result.ok).toBe(true)
          expect(result.value?.stdout.trim()).toBe(`exec-${index}`)
        })
      }),
    ),
  )
})
