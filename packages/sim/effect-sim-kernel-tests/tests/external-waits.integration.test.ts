import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer } from 'effect'

import { fileReadProgram, hostTimerProgram, makeHostFiles, removeHostFiles } from './__fixtures__/externalFixtures.js'
import { blockedFailureOf, completedRunOf, completedValueOf, escapeOf } from './__fixtures__/kernelFixtures.js'
import { answeringService, askAfterConnecting } from './__fixtures__/socketFixtures.js'

const Feature = makeFeature({ it })

const realReport = Effect.acquireRelease(makeHostFiles, removeHostFiles)

const refusalOf = <A>(run: () => Promise<A>): Effect.Effect<string> =>
  Effect.tryPromise({
    try: () => run().then(() => 'the run was not refused'),
    catch: (error) => (error instanceof Error ? error.message : 'a non-error was thrown'),
  }).pipe(Effect.catch((message: string) => Effect.succeed(message)))

Feature('Waiting on the host outside the controlled schedule')
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a kernel run cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A file read stops the run by default and names the file it waits on',
      Gherkin.Do.pipe(
        Given('a real report file on the host')('files', () => realReport),
        When('a program reads the report under the default rules')(
          'run',
          (s) => Effect.promise(() => Kernel.run(fileReadProgram(s.files.report), { external: 'fail' })),
        ),
        Then('the run fails, naming a wait on a file')((s, expect) => expect(blockedFailureOf(s.run).on).toBe('File')),
      ),
    )

    scenario(
      'A file read completes when the run may wait on the host',
      Gherkin.Do.pipe(
        Given('a real report file on the host')('files', () => realReport),
        When('a program reads the report with host waits allowed')(
          'run',
          (s) => Effect.promise(() => Kernel.run(fileReadProgram(s.files.report), { external: 'await' })),
        ),
        Then('the program gets the report back and every step keeps the default order')((s, expect) => {
          const steps = completedRunOf(s.run).steps
          return expect({ report: completedValueOf(s.run), choices: steps.map((step) => step.choice) }).toMatchObject({
            report: s.files.expected,
            choices: steps.map((step) => step.fallback),
          })
        }),
      ),
    )

    scenario(
      'A program that connects to a host service and then waits for its answer gets the answer',
      Gherkin.Do.pipe(
        Given('a service on the host that answers "pong" once it is asked')(
          'service',
          () => Effect.acquireRelease(answeringService, (service) => service.close),
        ),
        When('a program connects, then asks and waits on the same connection, with host waits allowed')(
          'run',
          (s) => Effect.promise(() => Kernel.run(askAfterConnecting(s.service.port), { external: 'await' })),
        ),
        Then('the program gets "pong" back')((s, expect) => expect(completedValueOf(s.run)).toBe('pong')),
      ),
    )

    scenario(
      'A real timer still fails the run when host waits are allowed',
      Gherkin.Do.pipe(
        Given('a program that sets a real timer while its work runs')(
          'program',
          () => Effect.succeed(hostTimerProgram(() => undefined)),
        ),
        When('the program runs with host waits allowed')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.program, { external: 'await' })),
        ),
        Then('the run fails because the timer escaped the controlled schedule')((s, expect) =>
          expect(escapeOf(s.run).timer).toBe('setTimeout')
        ),
      ),
    )

    scenario(
      'A chosen schedule cannot be combined with waiting on the host',
      Gherkin.Do.pipe(
        Given('a real report file on the host')('files', () => realReport),
        When('a program reads the report with host waits allowed and a chosen step')(
          'refusal',
          (s) => refusalOf(() => Kernel.run(fileReadProgram(s.files.report), { external: 'await', choose: () => 0 })),
        ),
        Then('the run is refused because host waits only follow the default order')((s, expect) =>
          expect(s.refusal).toContain('own order')
        ),
      ),
    )
  })
