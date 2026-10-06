import { commandOf } from '@systemfsoftware/effect-contract/cli'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  bundle,
  Harness,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import { contractSandboxRegistry } from '../../__fixtures__/contract-sandbox.fixture.js'
import {
  bodyTextOf,
  censusOf,
  cliOptions,
  outputOf,
  runCliWithRegistry,
  tagOf,
  url,
} from '../../__fixtures__/fixture-cli.js'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('../../__fixtures__/contract-sandbox.worker.ts', import.meta.url).pathname)),
)

const harnessLayer: Layer.Layer<Harness> = Layer.orDie(
  layer({ worker, bindings: [{ _tag: 'WorkerLoader', name: 'LOADER' }] }),
)

const bridge = (harness: HarnessShape): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.flatMap(Effect.orDie(HttpClientRequest.toWeb(request)), (web) =>
      harness
        .dispatchFetch(web.url, {
          method: web.method,
          headers: Object.fromEntries(web.headers),
          body: bodyTextOf(request.body),
        })
        .pipe(
          Effect.orDie,
          Effect.flatMap((remote) =>
            Effect.map(
              Effect.promise(() => remote.text()),
              (text) =>
                HttpClientResponse.fromWeb(
                  request,
                  new Response(text, { status: remote.status, headers: Object.fromEntries(remote.headers) }),
                ),
            )
          ),
        ))
  )

const withHarness = <A, E, R>(
  program: (harness: HarnessShape) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | HarnessStartFailed, R> =>
  Effect.scoped(
    Effect.gen(function*() {
      const harness = yield* Harness
      return yield* program(harness)
    }).pipe(Effect.provide(harnessLayer)),
  )

const run = (argv: ReadonlyArray<string>) =>
  withHarness((harness) => runCliWithRegistry(contractSandboxRegistry)(cliOptions)(bridge(harness))(argv))

const listedCapabilities = (): ReadonlyArray<string> =>
  commandOf(contractSandboxRegistry, { program: 'fixture-contract' }).subcommands.flatMap((group) =>
    group.commands.map((command) => command.name)
  )

const servedCapabilities = (): ReadonlyArray<string> => Object.keys(contractSandboxRegistry)

Feature('Operating a deployed contract Worker from a command line')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime serves the fixture Worker the command line drives over RPC')
  .body(({ scenario }) => {
    scenario(
      'A transfer with a negative amount is turned away before any money moves',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator transfers a negative amount to a well-formed account')(
          'attempt',
          (scope) =>
            run([
              'transfer',
              '--account',
              'acct_abcd1234',
              '--cents',
              '-1',
              '--target',
              scope.target,
              '--json',
            ]),
        ),
        Then('the transfer is reported as an invalid input and the command exits 2')((scope, expect) =>
          expect({ exit: scope.attempt.exitCode, tag: tagOf(scope.attempt) }).toEqual({ exit: 2, tag: 'Rejected' })
        ),
      ),
    )

    scenario(
      'A refused top-up exits with its own code so a script can tell it apart',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator tops up an account the fixture refuses')(
          'attempt',
          (scope) =>
            run([
              'topUp',
              '--account',
              'acct_abcd1234',
              '--amountCents',
              '100',
              '--target',
              scope.target,
              '--json',
            ]),
        ),
        Then('the refusal is reported and the command exits 3')((scope, expect) =>
          expect({ exit: scope.attempt.exitCode, tag: tagOf(scope.attempt) }).toEqual({ exit: 3, tag: 'Refused' })
        ),
      ),
    )

    scenario(
      'A balance read answers on the command line and exits cleanly',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator reads an account balance')(
          'attempt',
          (scope) => run(['getBalance', '--account', 'acct_abcd1234', '--target', scope.target, '--json']),
        ),
        Then('the balance is reported and the command exits 0')((scope, expect) =>
          expect({ exit: scope.attempt.exitCode, tag: tagOf(scope.attempt) }).toEqual({ exit: 0, tag: 'Completed' })
        ),
      ),
    )

    scenario(
      'Asking for help lists every capability the Worker serves',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator asks the command line for help')('help', () => run(['--help'])),
        Then('the help names exactly the served capabilities and the command exits 0')((scope, expect) => {
          const printed = outputOf(scope.help)
          return expect({
            exit: scope.help.exitCode,
            listed: [...listedCapabilities()].sort(),
            missing: servedCapabilities().filter((name) => !printed.includes(name)),
          }).toEqual({
            exit: 0,
            listed: [...servedCapabilities()].sort(),
            missing: [],
          })
        }),
      ),
    )

    scenario(
      'A durable hold tells the operator how to read the operation it started',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator places a hold')(
          'attempt',
          (scope) => run(['hold', '--ttlMs', '1000', '--target', scope.target]),
        ),
        Then('the next step reads the operation and the command exits 0')((scope, expect) => {
          const printed = outputOf(scope.attempt)
          return expect({
            exit: scope.attempt.exitCode,
            namesNextCommand: printed.includes('getOperation'),
            carriesInput: printed.includes('--input'),
            carriesOperation: printed.includes('AAAAAAAAAAAAAAAAAAAAAA'),
          }).toEqual({
            exit: 0,
            namesNextCommand: true,
            carriesInput: true,
            carriesOperation: true,
          })
        }),
      ),
    )

    scenario(
      'A union input arrives as JSON text or is turned away',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator runs a program whose lifetime is given as JSON')(
          'encoded',
          (scope) =>
            run([
              'runProgram',
              '--program',
              'return 1',
              '--programId',
              'p1',
              '--lifetime',
              '{"_tag":"Request"}',
              '--target',
              scope.target,
              '--json',
            ]),
        ),
        When('another operator runs a program whose lifetime is not valid JSON')(
          'malformed',
          (scope) =>
            run([
              'runProgram',
              '--program',
              'return 1',
              '--programId',
              'p1',
              '--lifetime',
              'not json',
              '--target',
              scope.target,
              '--json',
            ]),
        ),
        Then('the valid JSON runs and the malformed JSON is reported as an invalid input')((scope, expect) =>
          expect({
            encodedExit: scope.encoded.exitCode,
            encodedTag: tagOf(scope.encoded),
            malformedExit: scope.malformed.exitCode,
            malformedTag: tagOf(scope.malformed),
          }).toEqual({
            encodedExit: 0,
            encodedTag: 'Completed',
            malformedExit: 2,
            malformedTag: 'Rejected',
          })
        ),
      ),
    )

    scenario(
      'A program that fetches the open internet is refused at the sandbox edge',
      Gherkin.Do.pipe(
        Given('the fixture Worker is serving its capabilities over RPC')('target', () => Effect.succeed(url)),
        When('an operator runs a program that fetches example.com')(
          'attempt',
          (scope) =>
            run([
              'execute',
              '--program',
              "return await fetch('https://example.com')",
              '--programId',
              'cli-execute',
              '--lifetime',
              '{"_tag":"Request"}',
              '--target',
              scope.target,
              '--json',
            ]),
        ),
        Then('the sandbox refuses the fetch and the command exits 3')((scope, expect) =>
          expect({ exit: scope.attempt.exitCode, census: censusOf(scope.attempt) }).toEqual({
            exit: 3,
            census: { _tag: 'Refused', refusal: { _tag: 'SandboxEgressDenied', host: 'example.com' }, next: [] },
          })
        ),
      ),
    )
  })
