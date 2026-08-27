/**
 * The CLI contract lane (U2). Characterizes what the packed `stryker` tarball
 * does TODAY when an agent harness drives it, so PR-A's rewrites of the
 * presentation path cannot change the observable surface in silence.
 *
 * Every assertion here was captured from a real run of the real tarball in a
 * real container. Three scenarios pin behaviour that is wrong today - the run
 * command rejects the output-format and json options, and prose keeps its
 * colour codes when no terminal is listening - so a later unit that fixes any
 * of them turns this lane red on purpose rather than by accident.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import * as S from 'effect/Schema'
import { expect } from 'vitest'
const checkExpect = expect
import { ManifestSchema, type StreamLine, StreamLineSchema } from './__fixtures__/cli-contract.schema.js'
import { CLI_BIN, fixtureDir, WORKDIR } from './__fixtures__/stryker-cli-env.js'
import { type CliResult, layerStrykerCli, StrykerCli } from './__fixtures__/StrykerCliAdapter.js'

function isSupportedNodeVersion(version: string, range: string): boolean {
  let withoutV = version
  if (version.startsWith('v')) {
    withoutV = version.slice(1)
  }
  let dashBase = withoutV
  const dashBaseRaw = withoutV.split('-')[0]
  if (dashBaseRaw !== undefined) {
    dashBase = dashBaseRaw
  }
  let base = dashBase
  const baseRaw = dashBase.split('+')[0]
  if (baseRaw !== undefined) {
    base = baseRaw
  }
  const parts = base.split('.').map((p) => Number.parseInt(p, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return false
  }
  const rangeClean = range.replace(/^>=/, '')
  const rangeParts = rangeClean.split('.').map((p) => Number.parseInt(p, 10))
  const reqMajor = rangeParts[0] ?? 0
  const reqMinor = rangeParts[1] ?? 0
  const reqPatch = rangeParts[2] ?? 0
  if (major !== reqMajor) {
    return major > reqMajor
  }
  if (minor !== reqMinor) {
    return minor > reqMinor
  }
  return patch >= reqPatch
}

interface Observed {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly lines: readonly StreamLine[]
}

const decodeStreamLine = S.decodeUnknownSync(S.fromJsonString(StreamLineSchema))

const parseStream = (stdout: string): readonly StreamLine[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => decodeStreamLine(line))

/** `checkExpect.any` is typed `any` by vitest; the matcher's shape is untyped by design. */
const anyNumberMatcher: unknown = checkExpect.any(Number)

const invoke = (
  fixture: string,
  args: readonly string[],
  env?: Record<string, string>,
): Effect.Effect<Observed, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const cwd = fixtureDir(fixture)
    const result = yield* cli.run(args, {
      cwd,
      ...((() => {
        if (env === undefined) {
          return {}
        }
        return { env }
      })()),
    })
    const streamCat = yield* cli.sh('cat reports/mutation-stream.jsonl 2>/dev/null || true', { cwd })
    let source = result.stdout
    if (streamCat.stdout.trim().length > 0) {
      source = streamCat.stdout
    }
    return { ...result, lines: parseStream(source) }
  })

const shIn = (fixture: string, script: string): Effect.Effect<Observed, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const cwd = fixtureDir(fixture)
    const result = yield* cli.sh(script, { cwd })
    const streamCat = yield* cli.sh('cat reports/mutation-stream.jsonl 2>/dev/null || true', { cwd })
    let source = result.stdout
    if (streamCat.stdout.trim().length > 0) {
      source = streamCat.stdout
    }
    return { ...result, lines: parseStream(source) }
  })

interface CoreEntryImport {
  readonly entry: string
  readonly specifier: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

interface CorePurityProbe {
  readonly nodeVersion: string
  readonly enginesFloor: string
  readonly nodeUnsupported: boolean
  readonly entries: readonly CoreEntryImport[]
  readonly cliVersion: CliResult
}

const CORE_PACKAGE_MANIFEST = `${WORKDIR}/node_modules/@systemfsoftware/stryker-js-platform-node/package.json`

/**
 * U9: core's imports used to run `guardMinimalNodeVersion()` at module scope,
 * so a mere import could write to stderr and throw. The guard moved to the
 * cli package; core is now side-effect-free. This probe re-asserts the old
 * red-by-design property as a green one: every entry core declares today must
 * import silently, under a real per-entry node process (R19, R33).
 */
const corePurityProbe = (fixture: string): Effect.Effect<CorePurityProbe, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const options = { cwd: fixtureDir(fixture) }
    const nodeVersionResult = yield* cli.sh('node --version', options)
    const manifestResult = yield* cli.sh(
      `node -e "process.stdout.write(JSON.stringify(Object.keys(require('${CORE_PACKAGE_MANIFEST}').exports)))"`,
      options,
    )
    const enginesResult = yield* cli.sh(
      `node -e "process.stdout.write(require('${CORE_PACKAGE_MANIFEST}').engines.node)"`,
      options,
    )
    const entries = (
      yield* S.decodeUnknownEffect(S.fromJsonString(S.Array(S.String)))(manifestResult.stdout).pipe(Effect.orDie)
    ).filter((entry) => entry !== './package.json')
    const imports: CoreEntryImport[] = []
    for (const entry of entries) {
      const specifier = `@systemfsoftware/stryker-js-platform-node${entry.slice(1)}`
      // The specifier travels in the environment so a future entry's spelling
      // can never break the shell quoting of the probe command itself.
      const probe = yield* cli.sh('node --input-type=module -e "await import(process.env.CORE_ENTRY)"', {
        ...options,
        env: { CORE_ENTRY: specifier },
      })
      imports.push({ entry, specifier, ...probe })
    }
    const nodeVersion = nodeVersionResult.stdout.trim()
    const enginesFloor = enginesResult.stdout.trim()
    return {
      nodeVersion,
      enginesFloor,
      nodeUnsupported: !isSupportedNodeVersion(nodeVersion, enginesFloor),
      entries: imports,
      cliVersion: yield* cli.run(['--version'], options),
    }
  })

const kindsOf = (observed: Observed): readonly string[] => observed.lines.map((line) => line.kind)

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
const byMutatorName = <T extends { readonly mutator?: string | undefined }>(
  lines: readonly T[],
): readonly T[] => [...lines].sort((left, right) => String(left['mutator']).localeCompare(String(right['mutator'])))

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
          checkExpect(s.observed.lines[0]).toMatchObject({ kind: 'stream', schemaVersion: '1.0', mode: 'machine' })
        }),
        Then('the closing line repeats the run id the header opened with')((s) => {
          checkExpect(s.observed.lines[0]?.['runId']).toEqual(terminal(s.observed)['runId'])
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
            checkExpect(stages).toEqual(['prepare', 'instrument', 'dry-run', 'mutation-test'])
          },
        ),
        Then('each stage says how long the run had been going when it began')((s) => {
          const elapsed = s.observed.lines
            .filter((line) => line.kind === 'phase')
            .map((line) => line['elapsedMs'])
            .filter((ms): ms is number => ms !== undefined)
          checkExpect(elapsed).toEqual([...elapsed].sort((left, right) => left - right))
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
          checkExpect(s.observed.lines.filter((line) => line.kind === 'plan')).toEqual([{ kind: 'plan', total: 2 }])
        }),
        Then('that announcement comes after every stage and before the closing line')((s) => {
          const kinds = kindsOf(s.observed)
          checkExpect(kinds.indexOf('plan')).toBeGreaterThan(kinds.lastIndexOf('phase'))
          checkExpect(kinds.indexOf('plan')).toBeLessThan(kinds.length - 1)
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
          checkExpect(kindsOf(s.observed).filter((kind) => TERMINAL_KINDS.includes(kind))).toEqual(['verdict'])
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
          checkExpect(s.observed.exitCode).toBe(0)
        }),
        Then('the closing line scores the run at a hundred and counts both mutants killed')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({
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
          checkExpect(kindsOf(s.observed)).not.toContain('mutant')
          checkExpect(terminal(s.observed)['mutants']).toEqual([])
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
          checkExpect(terminal(s.observed)['thresholds']).toEqual({ high: 100, low: 80, break: 100 })
        }),
        Then('the closing line names the report path that only the shipped settings carry')((s) => {
          checkExpect(terminal(s.observed)['reportFile']).toBe('reports/mutation-report.json')
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
          checkExpect(s.observed.exitCode).toBe(1)
        }),
        Then('the closing line scores the run at fifty, with two killed and two left alive')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({
            kind: 'verdict',
            score: 50,
            counts: { killed: 2, survived: 2 },
          })
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
          checkExpect(survivors).toHaveLength(2)
          checkExpect(survivors.map((line) => line['status'])).toEqual(['Survived', 'Survived'])
          checkExpect(byMutatorName(survivors).map((line) => [line['mutator'], line['replacement']])).toEqual([
            ['ArithmeticOperator', 'a + b'],
            ['ArrowFunction', '() => undefined'],
          ])
          for (const survivor of survivors) {
            checkExpect(survivor['total']).toBe(4)
            checkExpect(survivor['completed'] ?? NaN).toBeGreaterThan(0)
            checkExpect(survivor['location']).toMatchObject({
              start: { line: anyNumberMatcher, column: anyNumberMatcher },
              end: { line: anyNumberMatcher, column: anyNumberMatcher },
            })
          }
        }),
        Then('the closing line lists the same survivors against a path relative to the project')((s) => {
          checkExpect(byMutatorName(terminal(s.observed)['mutants'] ?? [])).toMatchObject([
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
          checkExpect(s.observed.exitCode).toBe(2)
        }),
        Then('the closing line quotes the rejected setting and points the reader at the settings file')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({ kind: 'error', code: 2 })
          checkExpect(terminal(s.observed)['error']).toContain('Config option "concurrency" must match pattern')
          checkExpect(terminal(s.observed)['remediation']).toContain('check the config file')
        }),
        Then('the run never got past preparation, so nothing was planned or scored')((s) => {
          checkExpect(s.observed.lines.filter((line) => line.kind === 'phase').map((line) => line['phase']))
            .toEqual(['prepare'])
          checkExpect(kindsOf(s.observed)).not.toContain('plan')
          checkExpect(kindsOf(s.observed)).not.toContain('verdict')
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
          checkExpect(s.observed.exitCode).toBe(2)
        }),
        Then('the closing line names what it did not recognise and sends the reader to the usage text')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({
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
            checkExpect(s.observed.exitCode).toBe(2)
          }),
          Then('the closing line reports the request as something it does not recognise')((s) => {
            checkExpect(terminal(s.observed)).toMatchObject({ kind: 'error', code: 2 })
            checkExpect(terminal(s.observed)['error']).toContain(row.unrecognised)
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
          checkExpect(s.observed.exitCode).toBe(0)
        }),
        Then('the description names the tool and the command that runs mutation testing')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({ kind: 'manifest', code: 0 })
          const described = S.decodeUnknownSync(S.fromJsonString(ManifestSchema))(
            terminal(s.observed)['manifest'] ?? '',
          )
          checkExpect(described.tool).toBe('stryker')
          checkExpect(described.commands[0]?.subcommands).toContainEqual(
            expect.objectContaining({ name: 'run', description: 'Run mutation testing' }),
          )
        }),
        Then('nothing was mutated on the way')((s) => {
          checkExpect(kindsOf(s.observed)).not.toContain('verdict')
          checkExpect(kindsOf(s.observed)).not.toContain('plan')
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
            checkExpect(s.observed.exitCode).toBe(0)
          }),
          Then('the closing line carries the usage text and no score')((s) => {
            checkExpect(terminal(s.observed)).toMatchObject({ kind: 'help', code: 0 })
            checkExpect(terminal(s.observed)['help']).toContain('USAGE')
            checkExpect(kindsOf(s.observed)).not.toContain('verdict')
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
          checkExpect(s.observed.lines.filter((line) => line.kind === 'tick').length).toBeGreaterThan(1)
        }),
        Then('each report comes about ten seconds after the one before it')((s) => {
          const elapsed = s.observed.lines
            .filter((line) => line.kind === 'tick')
            .map((line) => line['elapsedMs'])
            .filter((ms): ms is number => ms !== undefined)
          for (const [index, value] of elapsed.entries()) {
            checkExpect(value).toBeGreaterThanOrEqual((index + 1) * 10_000)
            checkExpect(value).toBeLessThan((index + 1) * 10_000 + 5_000)
          }
        }),
        Then('progress only moves forward, never past the announced total, and stops at the score')((s) => {
          const ticks = s.observed.lines.filter((line) => line.kind === 'tick')
          const done = ticks.map((line) => line['completed']).filter((n): n is number => n !== undefined)
          checkExpect(done).toEqual([...done].sort((left, right) => left - right))
          for (const tick of ticks) checkExpect(tick['total']).toBe(18)
          checkExpect(done.at(-1) ?? NaN).toBeLessThanOrEqual(18)
          const kinds = kindsOf(s.observed)
          checkExpect(kinds.indexOf('tick')).toBeGreaterThan(kinds.indexOf('plan'))
          checkExpect(kinds.lastIndexOf('tick')).toBeLessThan(kinds.indexOf('verdict'))
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
          checkExpect(s.observed.exitCode).toBe(0)
        }),
        Then('the output reads as progress prose')((s) => {
          checkExpect(s.observed.stdout).toContain('file(s) to be mutated')
        }),
        Then('not one machine-readable line is written')((s) => {
          checkExpect(s.observed.lines).toEqual([])
        }),
        Then('the prose still carries colour codes today, with nothing on the far end able to read them')((s) => {
          const escape = String.fromCharCode(27)
          checkExpect(s.observed.stdout).toContain(`${escape}[`)
        }),
      ),
    )

    scenario(
      'A run told to leave colour alone writes prose no terminal has to decode',
      Gherkin.Do.pipe(
        Given('a project whose suite kills every one of its mutants')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness asks for prose with colour turned off')(
          'observed',
          (s) => invoke(s.fixture, ['run'], { STRYKER_MODE: 'human', NO_COLOR: '1' }),
        ),
        Then('not one colour code reaches either descriptor')((s) => {
          const escape = String.fromCharCode(27)
          checkExpect(s.observed.stdout + s.observed.stderr).not.toContain(`${escape}[`)
        }),
        Then('the run still succeeds')((s) => {
          checkExpect(s.observed.exitCode).toBe(0)
        }),
      ),
    )

    scenario(
      'Asking the tool which version it is prints the version and starts no run',
      Gherkin.Do.pipe(
        Given('a project the harness could run against')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness asks the tool which version it is')(
          'observed',
          (s) => invoke(s.fixture, ['--version']),
        ),
        Then('the closing line carries the version it reported')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({ kind: 'help', code: 0 })
          checkExpect(String(terminal(s.observed)['help'])).toMatch(/^\d+\.\d+\.\d+/)
        }),
        Then('no stage of a run was ever announced')((s) => {
          checkExpect(kindsOf(s.observed)).toEqual(['stream', 'help'])
        }),
        Then('the tool reports that it succeeded')((s) => {
          checkExpect(s.observed.exitCode).toBe(0)
        }),
      ),
    )

    scenario(
      'A run stopped part way through by the operator still closes with one terminal line',
      Gherkin.Do.pipe(
        Given('a project whose run lasts long enough to be interrupted')(
          'fixture',
          () => Effect.succeed('slow-project'),
        ),
        When('the operator interrupts the run once it is under way')(
          'observed',
          (s) =>
            shIn(
              s.fixture,
              `${CLI_BIN} run > /tmp/int.out 2>/dev/null & P=$!; sleep 12; kill -INT $P; wait $P; echo "@@$?"; cat /tmp/int.out`,
            ),
        ),
        Then('the run reports the interruption as its closing line')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({ kind: 'error', code: 130 })
        }),
        Then('the closing line tells the caller a signal ended the run')((s) => {
          checkExpect(String(terminal(s.observed)['remediation'])).toContain('signal')
        }),
        Then('the run hands its caller the status a signal leaves behind')((s) => {
          checkExpect(s.observed.stdout).toContain('@@130')
        }),
      ),
    )

    scenario(
      'A reader that stops listening part way through does not wedge the run',
      Gherkin.Do.pipe(
        Given('a project whose run lasts long enough to outlive a short reader')(
          'fixture',
          () => Effect.succeed('slow-project'),
        ),
        When('the harness reads only the first four lines and then closes the pipe')(
          'observed',
          (s) =>
            shIn(
              s.fixture,
              `{ ${CLI_BIN} run 2>/dev/null; echo $? > /tmp/prc; } | head -4; echo "@@$(cat /tmp/prc)"`,
            ),
        ),
        Then('the run reaches its own ending rather than hanging on the closed pipe')((s) => {
          checkExpect(s.observed.stdout).toContain('@@')
        }),
        Then('the status reported belongs to the run and not to the reader')((s) => {
          checkExpect(s.observed.stdout).toContain('@@0')
        }),
      ),
    )

    scenario(
      'Asking for the survivors of a run nobody has done yet is refused with a pointer to what is missing',
      Gherkin.Do.pipe(
        Given('a project that has never been run')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the harness asks for only the survivors')(
          'observed',
          (s) => invoke(s.fixture, ['run', '--survivors']),
        ),
        Then('the refusal names the missing report and what to do about it')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({ kind: 'error', code: 2 })
          checkExpect(String(terminal(s.observed)['error'])).toContain('previous run')
        }),
        Then('the tool reports the refusal as a configuration fault')((s) => {
          checkExpect(s.observed.exitCode).toBe(2)
        }),
      ),
    )

    scenario(
      'A project whose mutant survives still reaches a verdict when its threshold permits one',
      Gherkin.Do.pipe(
        Given('a project with one mutant its suite never kills, allowed to score nothing')(
          'fixture',
          () => Effect.succeed('surviving-mutant-project'),
        ),
        When('the harness runs the mutation test')('observed', (s) => invoke(s.fixture, ['run'])),
        Then('the verdict reports a score of nothing')((s) => {
          checkExpect(terminal(s.observed)).toMatchObject({ kind: 'verdict', score: 0 })
        }),
        Then('the surviving mutant is named in the verdict')((s) => {
          const survivors = terminal(s.observed)['mutants'] ?? []
          checkExpect(survivors.map((mutant) => mutant['status'])).toEqual(['Survived'])
        }),
        Then('a score of nothing still clears a threshold that demands nothing')((s) => {
          checkExpect(s.observed.exitCode).toBe(0)
        }),
      ),
    )

    scenario(
      'Importing any declared part of the core package stays silent while the tool alone refuses unsupported Node versions',
      Gherkin.Do.pipe(
        Given('a container that has the packed core and cli packages installed')(
          'fixture',
          () => Effect.succeed('minimal-project'),
        ),
        When('the lane probes every declared core entry and asks the tool which version it is')(
          'probe',
          (s) => corePurityProbe(s.fixture),
        ),
        Then('every declared entry is read from the installed manifest rather than a fixed list')((s) => {
          const declared = s.probe.entries.map((entry) => entry.entry)
          checkExpect(declared.length).toBeGreaterThan(0)
          checkExpect(declared).toEqual(expect.arrayContaining(['.', './config/base']))
          checkExpect(declared.filter((entry) => entry.startsWith('./internal/'))).toEqual([])
          checkExpect(declared).not.toContain('./package.json')
        }),
        Then('importing each declared entry exits cleanly and writes nothing to either descriptor')((s) => {
          for (const entry of s.probe.entries) {
            checkExpect(entry).toMatchObject({ exitCode: 0, stdout: '', stderr: '' })
          }
        }),
        Then('the tool alone refuses the node versions the core package no longer guards')((s) => {
          checkExpect(s.probe.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/)
          checkExpect(s.probe.enginesFloor).not.toBe('')
          if (s.probe.nodeUnsupported) {
            checkExpect(s.probe.cliVersion.exitCode).not.toBe(0)
            checkExpect(s.probe.cliVersion.stdout).toBe('')
            checkExpect(s.probe.cliVersion.stderr).toContain('Node.js version')
          } else {
            checkExpect(s.probe.cliVersion.exitCode).toBe(0)
            checkExpect(s.probe.cliVersion.stderr).toBe('')
          }
        }),
      ),
    )
  })
