import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bundle, Harness, type HarnessOptions, type HarnessShape, layer } from '@systemfsoftware/effect-workerd-harness'
import { Duration, Effect, Layer, Schema } from 'effect'
import {
  SandboxResponse,
  SandboxRunRequest,
  type SandboxRunRequest as RunRequest,
} from '../../__fixtures__/sandbox-model.fixture.js'

const Feature = makeFeature({ it })

const upstream = `export default { fetch: () => new Response('upstream-ok') }`

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('../../__fixtures__/sandbox.worker.ts', import.meta.url).pathname)),
)

const options: HarnessOptions = {
  worker,
  durableObjects: [{ className: 'ProgramSupervisor', storage: 'sqlite' }],
  bindings: [
    { _tag: 'DurableObject', name: 'SUPERVISOR', className: 'ProgramSupervisor' },
    { _tag: 'WorkerLoader', name: 'LOADER' },
    { _tag: 'Service', name: 'UPSTREAM', worker: 'upstream' },
  ],
  services: [{ name: 'upstream', worker: upstream }],
}

const harnessLayer: Layer.Layer<Harness> = Layer.orDie(layer(options))

const withHarness = <A>(program: (harness: HarnessShape) => Effect.Effect<A>) =>
  Effect.scoped(
    Effect.gen(function*() {
      const harness = yield* Harness
      return yield* program(harness)
    }).pipe(Effect.provide(harnessLayer)),
  )

const runProgram = (harness: HarnessShape, request: RunRequest): Effect.Effect<SandboxResponse> =>
  Effect.gen(function*() {
    const body = yield* Schema.encodeEffect(Schema.fromJsonString(SandboxRunRequest))(request)
    const response = yield* harness.dispatchFetch('http://sandbox/run', { method: 'POST', body })
    const text = yield* Effect.promise(() => response.text())
    return yield* Schema.decodeEffect(Schema.fromJsonString(SandboxResponse))(text)
  }).pipe(Effect.orDie)

const run = (body: string, overrides: Partial<RunRequest> = {}): RunRequest => ({
  program: body,
  programId: 'program-1',
  lifetime: { _tag: 'Request' },
  allow: [],
  principal: { _tag: 'Anonymous' },
  catalogVersion: 'fixture-catalog-1',
  timeoutMs: 5000,
  cpuMs: 1000,
  ...overrides,
})

const stateful = (value: string) =>
  `await env.STATE.fetch('http://state/add', { method: 'POST', body: '${value}' });
   return await (await env.STATE.fetch('http://state/rows')).json()`

Feature('Running an agent program in the sandbox host')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime loads each program through the Worker Loader')
  .body(({ scenario }) => {
    scenario(
      'A program reaching a host outside its allow-list is denied',
      Gherkin.Do.pipe(
        When('a program fetches example.com')(
          'fetched',
          () =>
            withHarness((harness) =>
              runProgram(harness, run(`return await (await fetch('https://example.com/')).text()`))
            ),
        ),
        When('a program connects to example.com:443')(
          'connected',
          () =>
            withHarness((harness) =>
              runProgram(harness, run(`const socket = connect('example.com:443'); return 'connected'`))
            ),
        ),
        Then('both answer a typed egress denial')((scope, expect) =>
          expect({ fetched: scope.fetched, connected: scope.connected }).toEqual({
            fetched: { _tag: 'SandboxEgressDenied', host: 'example.com' },
            connected: { _tag: 'SandboxEgressDenied', host: 'example.com' },
          })
        ),
      ),
    )

    scenario(
      'The allow-list admits exactly the named host',
      Gherkin.Do.pipe(
        When('a program fetches an allowed and a denied host')(
          'body',
          () =>
            withHarness((harness) =>
              Effect.gen(function*() {
                const allowed = yield* runProgram(
                  harness,
                  run(`return await (await fetch('https://allowed.test/')).text()`, { allow: ['allowed.test'] }),
                )
                const denied = yield* runProgram(
                  harness,
                  run(`return await (await fetch('https://evil.test/')).text()`, { allow: ['allowed.test'] }),
                )
                return { allowed, denied }
              })
            ),
        ),
        Then('the allowed host answers upstream and the other is denied')((scope, expect) =>
          expect(scope.body).toEqual({
            allowed: { _tag: 'Completed', value: 'upstream-ok' },
            denied: { _tag: 'SandboxEgressDenied', host: 'evil.test' },
          })
        ),
      ),
    )

    scenario(
      'Two principals under different program ids get their own isolate and principal',
      Gherkin.Do.pipe(
        When('each principal runs the same program text with its own program id')(
          'names',
          () =>
            withHarness((harness) =>
              Effect.gen(function*() {
                const alice = yield* runProgram(
                  harness,
                  run(`return await tools.whoami({})`, {
                    programId: 'alice-program',
                    principal: { _tag: 'Person', subject: 'alice', scopes: [] },
                  }),
                )
                const bob = yield* runProgram(
                  harness,
                  run(`return await tools.whoami({})`, {
                    programId: 'bob-program',
                    principal: { _tag: 'Person', subject: 'bob', scopes: [] },
                  }),
                )
                return { alice, bob }
              })
            ),
        ),
        Then('each tool call carries its own principal')((scope, expect) =>
          expect(scope.names).toEqual({
            alice: { _tag: 'Completed', value: { principal: 'alice' } },
            bob: { _tag: 'Completed', value: { principal: 'bob' } },
          })
        ),
      ),
    )

    scenario(
      'The program environment holds only its tool stubs',
      Gherkin.Do.pipe(
        When('a program enumerates env and probes a host binding')(
          'observed',
          () =>
            withHarness((harness) =>
              Effect.gen(function*() {
                const keys = yield* runProgram(harness, run(`return Object.keys(env)`))
                const probe = yield* runProgram(harness, run(`return typeof env.LOADER`))
                return { keys, probe }
              })
            ),
        ),
        Then('env names only TOOLS and no host binding leaks through')((scope, expect) =>
          expect(scope.observed).toEqual({
            keys: { _tag: 'Completed', value: ['TOOLS'] },
            probe: { _tag: 'Completed', value: 'undefined' },
          })
        ),
      ),
    )

    scenario(
      'A stateful program keeps its own Facet rows under its program id',
      Gherkin.Do.pipe(
        When('a Session program runs twice and a second program id runs once')(
          'rows',
          () =>
            withHarness((harness) =>
              Effect.gen(function*() {
                const first = yield* runProgram(
                  harness,
                  run(stateful('r1'), { programId: 'session-a', lifetime: { _tag: 'Session', ttlSeconds: 60 } }),
                )
                const second = yield* runProgram(
                  harness,
                  run(stateful('r2'), { programId: 'session-a', lifetime: { _tag: 'Session', ttlSeconds: 60 } }),
                )
                const other = yield* runProgram(
                  harness,
                  run(stateful('r9'), { programId: 'session-b', lifetime: { _tag: 'Session', ttlSeconds: 60 } }),
                )
                return { first, second, other }
              })
            ),
        ),
        Then('the second run reads the first run row and another program id never sees it')((scope, expect) =>
          expect(scope.rows).toEqual({
            first: { _tag: 'Completed', value: { rows: ['r1'] } },
            second: { _tag: 'Completed', value: { rows: ['r1', 'r2'] } },
            other: { _tag: 'Completed', value: { rows: ['r9'] } },
          })
        ),
      ),
    )

    scenario(
      'A Facet is deleted when the Session lifetime ends',
      Gherkin.Do.pipe(
        When('a Session program runs, its ttl expires and it runs again')(
          'rows',
          () =>
            withHarness((harness) =>
              Effect.gen(function*() {
                const first = yield* runProgram(
                  harness,
                  run(stateful('expire-1'), { programId: 'expiring', lifetime: { _tag: 'Session', ttlSeconds: 1 } }),
                )
                yield* Effect.sleep(Duration.seconds(3))
                const after = yield* runProgram(
                  harness,
                  run(stateful('expire-2'), { programId: 'expiring', lifetime: { _tag: 'Session', ttlSeconds: 1 } }),
                )
                return { first, after }
              })
            ),
        ),
        Then('the next run starts from an empty Facet')((scope, expect) =>
          expect(scope.rows).toEqual({
            first: { _tag: 'Completed', value: { rows: ['expire-1'] } },
            after: { _tag: 'Completed', value: { rows: ['expire-2'] } },
          })
        ),
      ),
    )

    scenario(
      'A program that never returns is stopped as a timeout',
      Gherkin.Do.pipe(
        When('a program awaits a promise that never settles, with a small budget')(
          'body',
          () =>
            withHarness((harness) =>
              runProgram(
                harness,
                run(`await Promise.withResolvers().promise; return 'never'`, { timeoutMs: 300, cpuMs: 100 }),
              )
            ),
        ),
        Then('the run answers SandboxTimeout')((scope, expect) =>
          expect(scope.body).toEqual({ _tag: 'SandboxTimeout' })
        ),
      ),
    )

    scenario(
      'A program that throws answers SandboxThrew',
      Gherkin.Do.pipe(
        When('a program throws before it returns')(
          'body',
          () => withHarness((harness) => runProgram(harness, run(`throw new Error('boom')`))),
        ),
        Then('the run answers SandboxThrew with the message')((scope, expect) =>
          expect(scope.body).toEqual({ _tag: 'SandboxThrew', message: 'boom' })
        ),
      ),
    )

    scenario(
      'A tool refusal inside the program is reported encoded',
      Gherkin.Do.pipe(
        When('a program calls a refusing tool')(
          'body',
          () => withHarness((harness) => runProgram(harness, run(`return await tools.refuse({})`))),
        ),
        Then('the run carries the encoded refusal')((scope, expect) =>
          expect(scope.body).toEqual({
            _tag: 'SandboxThrew',
            message: '{"_tag":"NotAllowed","reason":"the fixture always refuses"}',
          })
        ),
      ),
    )
  })
