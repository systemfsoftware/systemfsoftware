import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'
import {
  admitDecodedCommand,
  Admitted,
  Decoded,
  type Malformed,
  Rejected,
} from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it, layer })

interface Command {
  readonly id: string
}

const render = (outcome: Result.Result<Admitted | Rejected, Malformed>): string =>
  Result.match(outcome, {
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('Admitted', (admitted) => `admitted:${admitted.length}`),
        Match.tag('Rejected', (rejected) => `refused:${rejected.why}`),
        Match.exhaustive,
      ),
    onFailure: (malformed) => `malformed:${malformed.length}`,
  })

const answeringCell = Sandwich.read((command: Command) => Effect.succeed(new Decoded({ length: command.id.length })))
  .decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
    Effect.sync(() => render(outcome))
  )

const command: Command = { id: 'abcd' }

Feature('Composing pipelines through the piped instance method').body(({ scenario }) => {
  scenario(
    'Piping map and zip through the instance answers like the module duals',
    Gherkin.Do.pipe(
      When('a labelled pipeline runs beside its twin')(
        'run',
        () => {
          const viaInstance = answeringCell.pipe(
            Cell.map((line) => `seen:${line}`),
            Cell.zip(answeringCell),
          )
          const viaDuals = Cell.zip(Cell.map(answeringCell, (line) => `seen:${line}`), answeringCell)
          return Effect.map(
            Effect.zip(viaInstance.run(command), viaDuals.run(command)),
            ([fromInstance, fromDuals]) => ({ fromInstance, fromDuals }),
          )
        },
      ),
      Then('both pipelines answer the identical paired lines')((s) => {
        expect(s.run.fromInstance).toStrictEqual(s.run.fromDuals)
        expect(s.run.fromInstance).toStrictEqual(['seen:admitted:4', 'admitted:4'] as const)
      }),
    ),
  )

  scenario(
    'A piped pipeline pipes a second time and keeps answering',
    Gherkin.Do.pipe(
      When('a counted pipeline is lengthened once more')(
        'exit',
        () => {
          const once = answeringCell.pipe(Cell.map((line) => line.length))
          const twice = once.pipe(Cell.map((count) => count + 1))
          return Effect.exit(twice.run(command))
        },
      ),
      Then('the twice-counted line length arrives')(({ exit }) => {
        expect(exit).toStrictEqual(Exit.succeed('admitted:4'.length + 1))
      }),
    ),
  )

  scenario(
    'A constant answers and a refusal carries its error',
    Gherkin.Do.pipe(
      When('a constant and a refusal run side by side')(
        'run',
        () =>
          Effect.map(
            Effect.zip(
              Cell.succeed(7).run(command),
              Effect.exit(Cell.fail({ offline: true } as const).run(command)),
            ),
            ([constant, refusal]) => ({ constant, refusal }),
          ),
      ),
      Then('the constant arrives and the refusal carries the error')((s) => {
        expect(s.run.constant).toStrictEqual(7)
        expect(s.run.refusal).toStrictEqual(Exit.fail({ offline: true } as const))
      }),
    ),
  )

  scenario(
    'A lifted effect carries its success and its failure',
    Gherkin.Do.pipe(
      When('a lifted success and a lifted failure run side by side')(
        'run',
        () =>
          Effect.map(
            Effect.zip(
              Cell.fromEffect(Effect.succeed('up')).run(command),
              Effect.exit(Cell.fromEffect(Effect.fail({ offline: true } as const)).run(command)),
            ),
            ([line, refusal]) => ({ line, refusal }),
          ),
      ),
      Then('both channels arrive intact')((s) => {
        expect(s.run.line).toStrictEqual('up')
        expect(s.run.refusal).toStrictEqual(Exit.fail({ offline: true } as const))
      }),
    ),
  )

  scenario(
    'A deferred cell builds on first run, never at wrap time',
    Gherkin.Do.pipe(
      When('a counted thunk is wrapped and then run twice')(
        'run',
        () => {
          let builds = 0
          const deferred = Cell.suspend(() => {
            builds = builds + 1
            return Cell.succeed(builds)
          })
          const wrapped = builds
          return Effect.map(
            Effect.zip(deferred.run(command), deferred.run(command)),
            ([first, second]) => ({ wrapped, first, second }),
          )
        },
      ),
      Then('the wrap builds nothing and each run builds once')((s) => {
        expect(s.run.wrapped).toStrictEqual(0)
        expect(s.run.first).toStrictEqual(1)
        expect(s.run.second).toStrictEqual(2)
      }),
    ),
  )

  scenario(
    'The identity arrow echoes and composes as both-sided identity',
    Gherkin.Do.pipe(
      When('an echoed command runs beside its left and right compositions')(
        'run',
        () => {
          const echoed = Cell.id<Command>().run(command)
          const left = Cell.andThen(Cell.id<Command>(), answeringCell).run(command)
          const right = Cell.andThen(answeringCell, Cell.id<string>()).run(command)
          const viaPipe = answeringCell.pipe(Cell.andThen(Cell.id<string>())).run(command)
          return Effect.map(
            Effect.zip(Effect.zip(echoed, left), Effect.zip(right, viaPipe)),
            ([[echo, leftLine], [rightLine, pipedLine]]) => ({ echo, leftLine, rightLine, pipedLine }),
          )
        },
      ),
      Then('the echo matches and every identity composition answers the line')((s) => {
        expect(s.run.echo).toStrictEqual(command)
        expect(s.run.leftLine).toStrictEqual('admitted:4')
        expect(s.run.rightLine).toStrictEqual('admitted:4')
        expect(s.run.pipedLine).toStrictEqual('admitted:4')
      }),
    ),
  )

  scenario(
    'Generated commands keep the identity as both-sided identity',
    Gherkin.Do.pipe(
      When('a diverse batch runs echo and every identity composition')(
        'run',
        () => {
          const ids = [
            '',
            'a',
            'ab',
            'abc',
            'abcd',
            'abcdefgh',
            'x'.repeat(64),
            'héllo-✓-世界',
            'a b\tc',
            '0000',
          ] as const
          const outcomes = ids.map((raw) => {
            const input = { id: raw }
            return {
              input,
              echo: Effect.runSync(Cell.id<Command>().run(input)),
              left: Effect.runSync(Cell.andThen(Cell.id<Command>(), answeringCell).run(input)),
              right: Effect.runSync(Cell.andThen(answeringCell, Cell.id<string>()).run(input)),
              piped: Effect.runSync(answeringCell.pipe(Cell.andThen(Cell.id<string>())).run(input)),
            }
          })
          return Effect.succeed({ outcomes })
        },
      ),
      Then('every input echoes and every composition agrees')((s) => {
        expect(s.run.outcomes.length).toStrictEqual(10)
        for (const outcome of s.run.outcomes) {
          expect(outcome.echo).toStrictEqual(outcome.input)
          expect(outcome.left).toStrictEqual(outcome.right)
          expect(outcome.left).toStrictEqual(outcome.piped)
        }
      }),
    ),
  )

  scenario(
    'A refusal outcome passes through orElse with the fallback never running',
    Gherkin.Do.pipe(
      When('a refusing pipeline wrapped in orElse runs')(
        'run',
        () => {
          const trace: string[] = []
          const fallback = Cell.fromEffect(
            Effect.sync(() => {
              trace.push('fallback')
              return 'fallback-line'
            }),
          )
          const guarded = Cell.orElse(answeringCell, fallback)
          const short: Command = { id: 'x' }
          return Effect.map(guarded.run(short), (line) => ({ line, ran: trace }))
        },
      ),
      Then('the refusal arrives intact and the fallback never ran')((s) => {
        expect(s.run.line).toStrictEqual('refused:too short')
        expect(s.run.ran).toStrictEqual([])
      }),
    ),
  )

  scenario(
    'An infra failure runs the fallback on the same input and replaces the failure',
    Gherkin.Do.pipe(
      When('a failing read wrapped in orElse runs')(
        'run',
        () => {
          const seen: Command[] = []
          const failing = Sandwich.read(
            (): Effect.Effect<Decoded, { readonly offline: true }, never> => Effect.fail({ offline: true } as const),
          ).decide(admitDecodedCommand).write((outcome) => Effect.sync(() => render(outcome)))
          const watching = Cell.mapInput(Cell.fromEffect(Effect.sync(() => 'fallback-line')), (command: Command) => {
            seen.push(command)
            return command
          })
          const guarded = failing.pipe(Cell.orElse(watching))
          return Effect.map(guarded.run(command), (line) => ({ line, seen }))
        },
      ),
      Then('the fallback line replaces the failure and saw the original input')((s) => {
        expect(s.run.line).toStrictEqual('fallback-line')
        expect(s.run.seen).toStrictEqual([command])
      }),
    ),
  )

  scenario(
    'orElse runs its fallback exactly when the wrapped run fails',
    Gherkin.Do.pipe(
      When('a mixed batch runs under orElse')(
        'run',
        () => {
          let fallbacks = 0
          const flaky = Sandwich.read(
            (command: Command): Effect.Effect<Decoded, { readonly offline: true }, never> =>
              command.id.length === 0
                ? Effect.fail({ offline: true } as const)
                : Effect.succeed(new Decoded({ length: command.id.length })),
          ).decide(admitDecodedCommand).write((outcome) => Effect.sync(() => render(outcome)))
          const guarded = Cell.orElse(
            flaky,
            Cell.fromEffect(Effect.sync(() => {
              fallbacks = fallbacks + 1
              return 'fallback-line'
            })),
          )
          const ids = ['', 'a', 'ab', 'abc', 'abcd', 'abcde']
          return Effect.map(
            Effect.forEach(ids, (raw) => guarded.run({ id: raw })),
            (lines) => ({ lines, fallbacks }),
          )
        },
      ),
      Then('only the failing input fell back')((s) => {
        expect(s.run.lines).toStrictEqual([
          'fallback-line',
          'refused:too short',
          'refused:too short',
          'refused:too short',
          'admitted:4',
          'admitted:5',
        ])
        expect(s.run.fallbacks).toStrictEqual(1)
      }),
    ),
  )

  scenario(
    'mapError remaps the failure and leaves the response',
    Gherkin.Do.pipe(
      When('a failing cell and an answering cell run under mapError')(
        'run',
        () =>
          Effect.map(
            Effect.zip(
              Effect.exit(Cell.mapError(Cell.fail({ offline: true } as const), () => 'mapped').run(command)),
              answeringCell.pipe(Cell.mapError(() => 'never-used')).run(command),
            ),
            ([refusal, line]) => ({ refusal, line }),
          ),
      ),
      Then('the error is remapped and the response passes through')((s) => {
        expect(s.run.refusal).toStrictEqual(Exit.fail('mapped'))
        expect(s.run.line).toStrictEqual('admitted:4')
      }),
    ),
  )

  scenario(
    'tap observes the response then continues unchanged and in order',
    Gherkin.Do.pipe(
      When('an observed pipeline runs')(
        'run',
        () => {
          const trace: string[] = []
          const observed = Cell.tap(answeringCell, (line) =>
            Effect.sync(() => {
              trace.push(line)
            }))
          return Effect.map(observed.run(command), (line) => ({ line, trace }))
        },
      ),
      Then('the response is unchanged and the observation ran first')((s) => {
        expect(s.run.line).toStrictEqual('admitted:4')
        expect(s.run.trace).toStrictEqual(['admitted:4'])
      }),
    ),
  )

  scenario(
    'tap on a failure skips the observer and keeps the failure',
    Gherkin.Do.pipe(
      When('an observed failing cell runs')(
        'run',
        () => {
          const trace: string[] = []
          const observed = Cell.tap(Cell.fail({ offline: true } as const), () =>
            Effect.sync(() => {
              trace.push('observed')
            }))
          return Effect.map(Effect.exit(observed.run(command)), (exit) => ({ exit, trace }))
        },
      ),
      Then('the failure arrives and nothing was observed')((s) => {
        expect(s.run.exit).toStrictEqual(Exit.fail({ offline: true } as const))
        expect(s.run.trace).toStrictEqual([])
      }),
    ),
  )
})
