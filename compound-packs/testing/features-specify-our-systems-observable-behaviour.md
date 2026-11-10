---
title: A Feature specifies the observable behaviour of our system under test in its consumer's language, never a third party, a library or a unit of the implementation
applies_when:
  - adding, renaming or reviewing a behaviour test (a test that builds an effect-gherkin-spec Feature)
  - writing a Feature or scenario title, or step text
  - testing how the system talks to a third-party service, library, protocol or platform
  - testing a configuration layer, decoder, schema or other single unit through Gherkin
tags: [testing, behaviour-test, bdd, gherkin, feature, capability, third-party]
---

A Feature specifies one capability of the system under test as its consumer observes it. The consumer is the person using the app, the code or operator that calls the package, or, for a port's contract suite, the code that calls the port. The test file name and Feature title name that capability (`placing-an-order.integration.test.ts`, "Placing an order").

Never make the subject a third party (service, library, protocol, wire format, request shape, status code, platform API). How our adapter talks to a third party is proven by the port's contract suite in the port's terms (adapters-run-against-real-local-resources.md).

Never make the subject an internal unit (function, module, class, component, store, decoder, schema, configuration layer, service the consumer does not call). A Feature over an internal unit is deleted, not reshaped into another Feature or kept under a BDD name. A property of a decision is a separate test, judged only by the property-testing pack. In a library package the published operation is the consumer's entry and may be named.

A behaviour that needs real IO (a database, a bucket, a queue, a served page, several services together) is preferably an end-to-end test in the project's E2E package, driven through effect-e2e (e2e-testing pack). A Feature that stubs that IO, or does none, is not a substitute for it.

Titles and step text name no third party and no unit, type, file or setting the consumer never meets. They may name our own published interface (the route a client calls and the status it gets, the command and flag an operator types, the environment variable the operator docs name). A matrix of visual states is a visual or accessibility check, not a Feature.

Test: swap the third party for a competitor and the implementation for another that serves the consumer equally well; if any title, step or expected value must change, the Feature is wrong. Judge by the step bodies, not the titles (scenarios-drive-the-consumer-entry-and-read-what-it-observes.md); a retitled Feature with unchanged bodies is the same test.

## Rubric

Answer each question from the step bodies and the layers the Feature provides. A single "no" means the Feature, or that scenario, is deleted.

1. Does every When drive an entry the consumer uses (the published operation, the route, the command, the page), the same entry production runs?
2. Does every Given body produce each fact its text claims? A Given whose body is `Effect.void`, or returns a constant and binds nothing, is a no. So is a Given whose state is actually injected later in the When.
3. Does every Then read only what the consumer observes: the entry's result or failure, or state read back through an operation the system offers? A Then that queries the database, a table or a store's internals directly is a no.
4. Does every service the scenario reaches run its real layer, or a port fake that runs in that port's contract suite (port-fakes-share-a-contract-suite.md)? A first-party service supplied with `Layer.succeed(Service, Service.of({ ... }))`, an object literal or a partial shape is a no.
5. Does the scenario layer provide the world the Givens claim? `.withScenarioLayer(Layer.empty)` under Givens that claim stored state is a no.
6. Is every step's text declarative: what happens, not how? Ask of each step "would this wording change if the implementation did?". A step naming an internal function, a layer, a tool's wire format, a file, an environment variable or a UI mechanic the consumer never meets is a no. Our own published interface may be named.

Edge cases:

- A Given that claims "nothing exists yet" passes question 2 when the real world it runs against starts empty. It needs no body.
- A port fake that runs in its contract suite beside the real adapter passes question 4.
- In a library package the published operation is the consumer's entry, so calling it directly passes question 1.
- Retitling steps changes nothing: the verdict comes from the bodies.
- A Given may write state straight into the store (rows in a test database, a seeded file); a Then may not read it back that way.

Write scenarios the way Gherkin intends ([reference](https://cucumber.io/docs/gherkin/reference/), [better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/)). These shape the Feature; they are not delete criteria:

- Given puts the system in a known state before the consumer acts, and says nothing about the consumer's interaction. When is one event or action. Then is an outcome the consumer can observe.
- An example illustrates one business rule in 3 to 5 steps. Group the examples of one rule under a Rule, and turn examples that differ only in values into a Scenario Outline with Examples rows.
- A Background is at most 4 lines, uses vivid named actors and data instead of `user A` or `site 1`, and holds only context every scenario under it needs.

```typescript
// WRONG: the subject is a vendor and its HTTP contract
Feature('The payment provider receives a signed charge request')
// RIGHT
Feature('Paying for an order')

// WRONG (delete), the stub wall: the When calls a real handler, but every first-party service it reaches is an
// object literal, the state the Given names lives in an inline Ref no contract suite runs, and a .live reason
// string excuses the empty world. Questions 2, 4 and 5 fail.
const stubs = Layer.mergeAll(
  Layer.succeed(AppVersions, { checkOut: (_, files) => Ref.set(held.files, files), releaseDraft: () => Effect.void }),
  Layer.succeed(SaveRefusals, { keep: () => Effect.void }),
  Layer.succeed(MemoryWrites, { write: () => Effect.void }),
  Layer.succeed(MarketReads, { read: () => Effect.die(unreached) }),
)
Feature('a follow-up starts from the saved version')
  .live('the template loads through a real dynamic import')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) =>
    scenario(
      'the save reaches the bundler',
      Gherkin.Do.pipe(
        Given('an app whose saved version holds a changed screen')(() => Effect.void),
        When('the agent saves')('built', () => tools.handle('save_version', input).pipe(Effect.provide(stubs))),
        Then('the save reaches the bundler')(({ built }, expect) => expect(built.bundled).toBe(1)),
      ),
    )
  )

// WRONG (delete), configuration as a Feature: the Given claims an environment it never sets, and the When decodes
// a config under a provider it passes in itself. Questions 1 and 2 fail, and configuration gets no test at all
// (configuration-gets-no-test-and-no-gate.md).
Gherkin.Do.pipe(
  Given('every TRADES_ variable set, with 100 markets')(() => Effect.void),
  When('the trade source reads its settings')(
    'config',
    () => tradesConfig.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(settings)))),
  ),
  Then('each setting holds the value its variable carried')(({ config }, expect) => expect(config.markets).toBe(100)),
)

// WRONG (delete), a pure function behind a Feature: literal fixture maps go straight into an internal function, in
// an empty world. Questions 1, 2 and 5 fail.
Feature('the docs index is built from the declarations the save installs')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) =>
    scenario(
      'a package answers its version',
      Gherkin.Do.pipe(
        Given('zod 4.6.7 whose exports name its types')(() => Effect.void),
        When('the index is built')('index', () => Effect.sync(() => docsIndexOf({ types: literalFiles }))),
        Then('the version is answered')(({ index }, expect) => expect(index.zod.version).toBe('4.6.7')),
      ),
    )
  )

// RIGHT: the scenario layer is the real shells over the real database, with fakes only for third-party ports
// (here the chain and the signer), each a Context.Tag with failure controls and read-back operations. The Given
// writes the rows its text names, the When is the consumer's command through the shell's own entry, and the Thens
// read only what that command returns. Concurrency is a scenario, run against the same real store. (The source
// spec also had an And that read the ticket row straight from the database; that step fails question 3 and is cut.)
feature('Invitation Ticket Claiming')
  .withScenarioLayer(testLayer) // ClaimShell.Default and PoolShell over DBTest; only the chain and signer are fakes
  .withScope({ db: DB, shell: ClaimShell })
  .body(({ scenario, background, scope }) => {
    background(cleanUp)
    scenario(
      'Should_ClaimTicketAndReturnSignature_When_TicketAvailable',
      scope.pipe(
        Given('an available ticket in the Game pool')('ticket', ({ db }) =>
          Effect.gen(function*() {
            const ticket = yield* generateTestTicket
            yield* insertAvailableTicket(db, { publicKey: ticket.publicKey }, { privateKey: ticket.privateKey })
            return ticket
          })),
        When('claiming the ticket')(
          'result',
          ({ shell }) => shell.execute(new ClaimCommand({ who: ALICE, dim: GAME })),
        ),
        Then('claim returns a signature')(({ result }) => expect(result.signature).toBeDefined()),
        And('no tickets remain in the pool')(({ result }) => expect(result.remaining).toBe(0)),
      ),
    )
    scenario(
      'Should_AllowOneWinner_When_TwoConcurrentClaims',
      scope.pipe(
        Given('one available ticket')(({ db }) => insertOneAvailableTicket(db)),
        When('two addresses claim concurrently')('results', ({ shell }) =>
          Effect.all([
            shell.execute(new ClaimCommand({ who: ALICE, dim: GAME })).pipe(Effect.either),
            shell.execute(new ClaimCommand({ who: BOB, dim: GAME })).pipe(Effect.either),
          ], { concurrency: 2 })),
        Then('exactly one claim succeeds')(({ results }) => expect(results.filter(Either.isRight).length).toBe(1)),
      ),
    )
  })
```

Behaviour that needs the whole running system goes one level up instead: an effect-e2e test starts the shipped service and its dependencies (a compose environment or the platform's own dev server) and drives it through its public API or page, asserting only the response and what the API reads back.
