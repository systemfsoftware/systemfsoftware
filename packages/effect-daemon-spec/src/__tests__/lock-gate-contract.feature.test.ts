import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Option, Schedule } from 'effect'
import { expect } from 'vitest'
import type { LockConfig } from '../daemon-spec.js'
import { decideLockGate } from '../internal/lock-gate.js'

const Feature = makeFeature({ it, layer })

const backoff = Schedule.exponential(Duration.seconds(1))

Feature('Lock Gate Contract')
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'None-mode config bypasses lock',
      Gherkin.Do.pipe(
        Given('a lock config with mode none')(
          'config',
          () => Effect.succeed<LockConfig>({ mode: 'none' }),
        ),
        When('the lock policy is resolved')('result', (s) => Effect.succeed(decideLockGate(s.config))),
        Then('the lock gate decision is none')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual(Option.none())
          })
        ),
      ),
    )

    scenarioOutline(
      'Lock gate decision: <description>',
      [
        {
          config: { mode: 'none' } satisfies LockConfig,
          expectedTag: 'none',
          description: 'mode none bypasses lock',
        },
        {
          config: { key: 'leader', mode: 'required', acquireRetryBackoff: backoff } satisfies LockConfig,
          expectedTag: 'some',
          expectedKey: 'leader',
          expectedMode: 'required',
          description: 'required with key applies lock',
        },
        {
          config: { key: 'leader', mode: 'optional' } satisfies LockConfig,
          expectedTag: 'some',
          expectedKey: 'leader',
          expectedMode: 'optional',
          description: 'optional with key applies lock',
        },
        {
          config: { key: 'my-key-123', mode: 'required', acquireRetryBackoff: backoff } satisfies LockConfig,
          expectedTag: 'some',
          expectedKey: 'my-key-123',
          expectedMode: 'required',
          description: 'key is passed through when applying',
        },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a lock config')('config', () => Effect.succeed(row.config)),
          When('the lock policy is resolved')('result', (s) => Effect.succeed(decideLockGate(s.config))),
          Then('the lock gate decision matches expectation')((s) =>
            Effect.sync(() => {
              if (row.expectedTag === 'none') {
                expect(s.result).toEqual(Option.none())
              } else {
                expect(s.result).toEqual(
                  Option.some({
                    key: row.expectedKey,
                    mode: row.expectedMode,
                  }),
                )
              }
            })
          ),
        ),
    )
  })
