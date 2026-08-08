/**
 * The CLI contract lane (U2). Characterizes what the packed `stryker` tarball
 * does TODAY when an agent harness drives it, so PR-A's rewrites of the
 * presentation path cannot change the observable surface in silence.
 *
 * Every assertion here was captured from a real run of the real tarball in a
 * real container. Two scenarios pin behaviour that is wrong today - the run
 * command rejects the output-format and json options - so a later unit that
 * wires them turns this lane red on purpose rather than by accident.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { fixtureDir, layerStrykerCli, StrykerCli } from './stryker-cli.adapter.js'

interface StreamLine {
  readonly kind: string
  readonly [field: string]: unknown
}

interface Observed {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly lines: ReadonlyArray<StreamLine>
}

const parseStream = (stdout: string): ReadonlyArray<StreamLine> =>
  stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as StreamLine)

const invoke = (
  fixture: string,
  args: ReadonlyArray<string>,
  env?: Record<string, string>,
): Effect.Effect<Observed, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const result = yield* cli.run(args, {
      cwd: fixtureDir(fixture),
      ...(env === undefined ? {} : { env }),
    })
    return { ...result, lines: parseStream(result.stdout) }
  })

const kindsOf = (observed: Observed): ReadonlyArray<string> => observed.lines.map((line) => line.kind)

const terminal = (observed: Observed): StreamLine => {
  const last = observed.lines.at(-1)
  if (last === undefined) throw new Error(`no machine lines on stdout:\n${observed.stdout}`)
  return last
}

/**
 * Mutants are tested concurrently, so the order survivors reach stdout varies
 * between runs. Sorting by mutator name before comparing keeps the assertion
 * about which mutations survived rather than about which finished first.
 */
const byMutatorName = (lines: ReadonlyArray<StreamLine>): ReadonlyArray<StreamLine> =>
  [...lines].sort((left, right) => String(left['mutator']).localeCompare(String(right['mutator'])))

const TERMINAL_KINDS = ['verdict', 'error', 'help', 'manifest']

const Feature = makeFeature({ it, layer })

Feature('Driving the mutation tester from an agent harness')
  .withLayer(layerStrykerCli)
  .liveClock()
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A run whose output is not going to a terminal opens with one header naming the schema version',
      Gherkin.Do.pipe(
        Given('a project whose suite kills every one of its mutants')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('the very first line names the schema version and says the output is for a machine')((s) => {
          expect(s.observed.lines[0]).toMatchObject({ kind: 'stream', schemaVersion: '1.0', mode: 'machine' })
        }),
        Then('the closing line repeats the run id the header opened with')((s) => {
          expect(s.observed.lines[0]?.['runId']).toEqual(terminal(s.observed)['runId'])
        }),
      ),
    )

    scenario(
      'The four stages of a run are announced in the same fixed order',
      Gherkin.Do.pipe(
        Given('a project whose run reaches a score without failing')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('preparation, instrumentation, the trial run and the mutation testing are announced in that order')(
          (s) => {
            const stages = s.observed.lines.filter((line) => line.kind === 'phase').map((line) => line['phase'])
            expect(stages).toEqual(['prepare', 'instrument', 'dry-run', 'mutation-test'])
          },
        ),
        Then('each stage says how long the run had been going when it began')((s) => {
          const elapsed = s.observed.lines
            .filter((line) => line.kind === 'phase')
            .map((line) => line['elapsedMs'] as number)
          expect(elapsed).toEqual([...elapsed].sort((left, right) => left - right))
        }),
      ),
    )

    scenario(
      'The harness is told how much work there is before any of it is done',
      Gherkin.Do.pipe(
        Given('a project holding one source file with two mutants in it')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('exactly one line announces that two mutants will be tested')((s) => {
          expect(s.observed.lines.filter((line) => line.kind === 'plan')).toEqual([{ kind: 'plan', total: 2 }])
        }),
        Then('that announcement comes after every stage and before the closing line')((s) => {
          const kinds = kindsOf(s.observed)
          expect(kinds.indexOf('plan')).toBeGreaterThan(kinds.lastIndexOf('phase'))
          expect(kinds.indexOf('plan')).toBeLessThan(kinds.length - 1)
        }),
      ),
    )

    scenario(
      'A run says how it ended exactly once, and says nothing afterwards',
      Gherkin.Do.pipe(
        Given('a project whose suite kills every one of its mutants')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('one closing line reports the outcome and it is the last thing written')((s) => {
          expect(kindsOf(s.observed).filter((kind) => TERMINAL_KINDS.includes(kind))).toEqual(['verdict'])
        }),
      ),
    )

    scenario(
      'A run that kills every mutant scores a hundred and succeeds',
      Gherkin.Do.pipe(
        Given('a project that tolerates any score and whose suite kills both its mutants')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('the command succeeds')((s) => {
          expect(s.observed.exitCode).toBe(0)
        }),
        Then('the closing line scores the run at a hundred and counts both mutants killed')((s) => {
          expect(terminal(s.observed)).toMatchObject({
            kind: 'verdict',
            score: 100,
            counts: {
              killed: 2,
              timeout: 0,
              survived: 0,
              noCoverage: 0,
              runtimeErrors: 0,
              compileErrors: 0,
              ignored: 0,
              pending: 0,
            },
          })
        }),
        Then('no mutant is singled out, because none survived')((s) => {
          expect(kindsOf(s.observed)).not.toContain('mutant')
          expect(terminal(s.observed)['mutants']).toEqual([])
        }),
      ),
    )

    scenario(
      'A project that names only the shipped settings still gets their score limit and report path',
      Gherkin.Do.pipe(
        Given('a project that sets no score limit and no report path of its own')(
          'fixture',
          () => Effect.succeed('extends-base-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('the closing line reports the score limits that only the shipped settings carry')((s) => {
          expect(terminal(s.observed)['thresholds']).toEqual({ high: 100, low: 80, break: 100 })
        }),
        Then('the closing line names the report path that only the shipped settings carry')((s) => {
          expect(terminal(s.observed)['reportFile']).toBe('reports/mutation-report.json')
        }),
      ),
    )

    scenario(
      'A score below the inherited limit fails the command',
      Gherkin.Do.pipe(
        Given('a project inheriting a limit of a hundred whose suite leaves two of four mutants alive')(
          'fixture',
          () => Effect.succeed('extends-base-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('the command reports that the score was too low')((s) => {
          expect(s.observed.exitCode).toBe(1)
        }),
        Then('the closing line scores the run at fifty, with two killed and two left alive')((s) => {
          expect(terminal(s.observed)).toMatchObject({ kind: 'verdict', score: 50, counts: { killed: 2, survived: 2 } })
        }),
      ),
    )

    scenario(
      'Every mutant that survives is named as it is found and again at the end',
      Gherkin.Do.pipe(
        Given('a project of four mutants whose suite covers only half of them')(
          'fixture',
          () => Effect.succeed('extends-base-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('one line per survivor names the change that was made and where it was made')((s) => {
          const survivors = s.observed.lines.filter((line) => line.kind === 'mutant')
          expect(survivors).toHaveLength(2)
          expect(survivors.map((line) => line['status'])).toEqual(['Survived', 'Survived'])
          expect(byMutatorName(survivors).map((line) => [line['mutator'], line['replacement']])).toEqual([
            ['ArithmeticOperator', 'a + b'],
            ['ArrowFunction', '() => undefined'],
          ])
          for (const survivor of survivors) {
            expect(survivor['total']).toBe(4)
            expect(survivor['completed'] as number).toBeGreaterThan(0)
            expect(survivor['location']).toMatchObject({
              start: { line: expect.any(Number), column: expect.any(Number) },
              end: { line: expect.any(Number), column: expect.any(Number) },
            })
          }
        }),
        Then('the closing line lists the same survivors against a path relative to the project')((s) => {
          expect(byMutatorName(terminal(s.observed)['mutants'] as ReadonlyArray<StreamLine>)).toMatchObject([
            { status: 'Survived', file: 'src/calculator.js', mutator: 'ArithmeticOperator' },
            { status: 'Survived', file: 'src/calculator.js', mutator: 'ArrowFunction' },
          ])
        }),
      ),
    )

    scenario(
      'A setting given a value it does not allow stops the run before any code is changed',
      Gherkin.Do.pipe(
        Given('a project that asks to run "not-a-number" mutants at once')(
          'fixture',
          () => Effect.succeed('broken-config-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('the command reports that the settings were wrong')((s) => {
          expect(s.observed.exitCode).toBe(2)
        }),
        Then('the closing line quotes the rejected setting and points the reader at the settings file')((s) => {
          expect(terminal(s.observed)).toMatchObject({ kind: 'error', code: 2 })
          expect(terminal(s.observed)['error']).toContain('Config option "concurrency" must match pattern')
          expect(terminal(s.observed)['remediation']).toContain('check the config file')
        }),
        Then('the run never got past preparation, so nothing was planned or scored')((s) => {
          expect(s.observed.lines.filter((line) => line.kind === 'phase').map((line) => line['phase']))
            .toEqual(['prepare'])
          expect(kindsOf(s.observed)).not.toContain('plan')
          expect(kindsOf(s.observed)).not.toContain('verdict')
        }),
      ),
    )

    scenario(
      'An option the tool never declared is refused with a pointer to the usage text',
      Gherkin.Do.pipe(
        Given('a project that would otherwise run cleanly')('fixture', () => Effect.succeed('minimal-project')),
        When('the harness asks to run with an option the tool never declared')(
          'observed',
          (s) => invoke(s.fixture, ['run', '--nope']),
        ),
        Then('the command reports that the settings were wrong')((s) => {
          expect(s.observed.exitCode).toBe(2)
        }),
        Then('the closing line names what it did not recognise and sends the reader to the usage text')((s) => {
          expect(terminal(s.observed)).toMatchObject({
            kind: 'error',
            code: 2,
            error: "Received unknown argument: '--nope'",
            remediation: 're-run with --help to see the full usage',
          })
        }),
      ),
    )

    scenarioOutline(
      'Asking a run to <request> is refused today, even though the tool knows the two output styles',
      [
        {
          request: 'print plain text',
          args: ['run', '--format', 'text'],
          unrecognised: "Received unknown argument: 'text'",
        },
        { request: 'print json', args: ['run', '--json'], unrecognised: "Received unknown argument: '--json'" },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a project that would otherwise run cleanly')('fixture', () => Effect.succeed('minimal-project')),
          When('the harness asks for that output style while running')(
            'observed',
            (s) => invoke(s.fixture, row.args),
          ),
          Then('the command reports that the settings were wrong instead of running')((s) => {
            expect(s.observed.exitCode).toBe(2)
          }),
          Then('the closing line reports the request as something it does not recognise')((s) => {
            expect(terminal(s.observed)).toMatchObject({ kind: 'error', code: 2 })
            expect(terminal(s.observed)['error']).toContain(row.unrecognised)
          }),
        ),
    )

    scenario(
      'A harness meeting the tool for the first time can ask it to describe itself',
      Gherkin.Do.pipe(
        Given('a harness that has never driven this tool before')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness asks the tool to describe itself')(
          'observed',
          (s) => invoke(s.fixture, ['--llms']),
        ),
        Then('the command succeeds')((s) => {
          expect(s.observed.exitCode).toBe(0)
        }),
        Then('the description names the tool and the command that runs mutation testing')((s) => {
          expect(terminal(s.observed)).toMatchObject({ kind: 'manifest', code: 0 })
          const described = JSON.parse(terminal(s.observed)['manifest'] as string) as {
            tool: string
            commands: ReadonlyArray<{ subcommands: ReadonlyArray<{ name: string; description: string }> }>
          }
          expect(described.tool).toBe('stryker')
          expect(described.commands[0]?.subcommands).toContainEqual(
            expect.objectContaining({ name: 'run', description: 'Run mutation testing' }),
          )
        }),
        Then('nothing was mutated on the way')((s) => {
          expect(kindsOf(s.observed)).not.toContain('verdict')
          expect(kindsOf(s.observed)).not.toContain('plan')
        }),
      ),
    )

    scenarioOutline(
      'Invoking the tool with <invocation> prints the usage text and runs no mutation test',
      [
        { invocation: 'a request for help', args: ['--help'] },
        { invocation: 'nothing at all', args: [] },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a harness that wants to know how the tool is used')(
            'fixture',
            () => Effect.succeed('minimal-project'),
          ),
          When('the harness invokes the tool that way')('observed', (s) => invoke(s.fixture, row.args)),
          Then('the command succeeds rather than treating it as a mistake')((s) => {
            expect(s.observed.exitCode).toBe(0)
          }),
          Then('the closing line carries the usage text and no score')((s) => {
            expect(terminal(s.observed)).toMatchObject({ kind: 'help', code: 0 })
            expect(terminal(s.observed)['help']).toContain('USAGE')
            expect(kindsOf(s.observed)).not.toContain('verdict')
          }),
        ),
    )

    scenario(
      'A run long enough to look stalled keeps reporting its progress',
      Gherkin.Do.pipe(
        Given('a project of eighteen mutants whose suite sleeps two seconds and runs one mutant at a time')(
          'fixture',
          () => Effect.succeed('slow-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('progress is reported more than once during the run')((s) => {
          expect(s.observed.lines.filter((line) => line.kind === 'tick').length).toBeGreaterThan(1)
        }),
        Then('each report comes about ten seconds after the one before it')((s) => {
          const elapsed = s.observed.lines
            .filter((line) => line.kind === 'tick')
            .map((line) => line['elapsedMs'] as number)
          for (const [index, value] of elapsed.entries()) {
            expect(value).toBeGreaterThanOrEqual((index + 1) * 10_000)
            expect(value).toBeLessThan((index + 1) * 10_000 + 5_000)
          }
        }),
        Then('progress only moves forward, never past the announced total, and stops at the score')((s) => {
          const ticks = s.observed.lines.filter((line) => line.kind === 'tick')
          const done = ticks.map((line) => line['completed'] as number)
          expect(done).toEqual([...done].sort((left, right) => left - right))
          for (const tick of ticks) expect(tick['total']).toBe(18)
          expect(done.at(-1) as number).toBeLessThanOrEqual(18)
          const kinds = kindsOf(s.observed)
          expect(kinds.indexOf('tick')).toBeGreaterThan(kinds.indexOf('plan'))
          expect(kinds.lastIndexOf('tick')).toBeLessThan(kinds.indexOf('verdict'))
        }),
      ),
    )

    scenario(
      'A run asked to address a person prints prose and nothing a machine would parse',
      Gherkin.Do.pipe(
        Given('a project whose suite kills every one of its mutants')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness asks the tool to address a person instead')(
          'observed',
          (s) => invoke(s.fixture, ['run'], { STRYKER_MODE: 'human' }),
        ),
        Then('the command still succeeds')((s) => {
          expect(s.observed.exitCode).toBe(0)
        }),
        Then('the output reads as progress prose')((s) => {
          expect(s.observed.stdout).toContain('file(s) to be mutated')
        }),
        Then('not one machine-readable line is written')((s) => {
          expect(s.observed.lines).toEqual([])
        }),
      ),
    )
  })
