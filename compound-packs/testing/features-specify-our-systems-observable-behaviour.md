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

Answer each question per scenario, from the step bodies and the layers the Feature provides.

- A Feature whose subject is an internal unit, a third party or configuration proves no behaviour of ours: delete it with no replacement. The verdict is the scenarios', not the title's: a third-party title alone fails no scenario's question 1 — such a Feature falls because its Whens drive no consumer entry or its Thens read only the third party's side — and a scenario whose Then reads a consumer outcome is judged by bullet 2 like any other.
- A scenario that fails question 1, 2, 4, 5 or 6 is deleted, and the rest of its Feature stands when those scenarios pass. When its Then reads a consumer outcome, or reads one from the store directly (a question 3 failure), that behaviour is ours: the same change adds a scenario that passes the rubric, or an effect-e2e test when it needs real IO; where effect-e2e cannot yet express that test, the change follows the waiting rule of the e2e-testing pack (failing-tests-are-fixed-not-weakened.md). A scenario whose When drives a unit and whose Then reads that unit's output has no consumer outcome, so it needs no replacement.
- A Then that fails question 3 alone is rewritten to read the outcome through the system's own operations; the rest of the scenario stands. When the Then reads a stand-in's record (an inline stub's, or a third party's stand-in's received requests, that no contract suite runs), question 4 fails first and its verdict governs: rewriting the Then cannot make a stub no contract suite runs prove anything, and failing-tests-are-fixed-not-weakened.md says when the behaviour is replaced. When the Then reads only a third party's wire format, failing-tests-are-fixed-not-weakened.md governs instead and deletes the scenario with no replacement: how our adapter talks to a third party is the port's contract suite's proof, never the Feature's (adapters-run-against-real-local-resources.md).

1. Does every When drive an entry the consumer uses (the published operation, the route, the command, the page), the same entry production runs?
2. Does every Given body produce each fact its text claims? A Given whose body is `Effect.void`, or returns a constant and binds nothing, is a no. So is a Given whose state is actually injected later in the When.
3. Does every Then read only what the consumer observes: the entry's result or failure, state read back through an operation the system offers, or what our system sent through one of its own outbound ports, read in that port's terms through its contract-suite fake's read operation? A Then that queries the database, a table or a store's internals directly is a no.
4. Does every service the scenario reaches run its real layer, or a port fake that runs in that port's contract suite (port-fakes-share-a-contract-suite.md)? A first-party service supplied with `Layer.succeed(Service, Service.of({ ... }))`, an object literal or a partial shape is a no. A settings service (`<Feature>Config`) supplied with values is how tests provide settings (configuration pack: tests-supply-settings-and-never-mirror-them.md) and passes.
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
  Layer.succeed(Bookings, { hold: (_, room) => Ref.set(held.room, room), release: () => Effect.void }),
  Layer.succeed(Notifications, { send: () => Effect.void }),
  Layer.succeed(Loyalty, { award: () => Effect.void }),
  Layer.succeed(Payments, { charge: () => Effect.die(unreached) }),
)
Feature('a guest reserves a room')
  .live('the handler needs the real clock')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) =>
    scenario(
      'the reservation is confirmed',
      Gherkin.Do.pipe(
        Given('a hotel with one free double room')(() => Effect.void),
        When('the guest reserves it')(
          'booked',
          () => handlers.handle('reserve_room', input).pipe(Effect.provide(stubs)),
        ),
        Then('the reservation is confirmed')(({ booked }, expect) =>
          expect(booked).toMatchObject({ status: 'confirmed' })
        ),
      ),
    )
  )

// WRONG (delete), configuration as a Feature: the Given claims an environment it never sets, and the When decodes
// a config under a provider it passes in itself. Questions 1 and 2 fail, and configuration gets no test at all
// (configuration-gets-no-test-and-no-gate.md).
Gherkin.Do.pipe(
  Given('every HOTEL_ variable set, with 20 rooms')(() => Effect.void),
  When('the reservation service reads its settings')(
    'config',
    () => hotelConfig.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(settings)))),
  ),
  Then('each setting holds the value its variable carried')(({ config }, expect) => expect(config.rooms).toBe(20)),
)

// WRONG (delete), a pure function behind a Feature: literal fixture maps go straight into an internal function, in
// an empty world. Questions 1, 2 and 5 fail.
Feature('the price list is built from the rate files')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) =>
    scenario(
      'a room type answers its nightly rate',
      Gherkin.Do.pipe(
        Given('a deluxe room rated at 120 a night')(() => Effect.void),
        When('the price list is built')('prices', () => Effect.sync(() => priceListOf({ rates: literalFiles }))),
        Then('the rate is answered')(({ prices }, expect) => expect(prices.deluxe.nightly).toBe(120)),
      ),
    )
  )

// RIGHT: the scenario layer is the real services over the real store, with a fake only for the third-party
// payment provider, built as a service with failure controls and read-back operations and run in its port's
// contract suite. The Given puts the room in place, the When is the guest's command through the service's own
// entry, and every observed state of the command is asserted in one Then, with the expect the step receives. Concurrency is its own scenario, against the same store.
Feature('Reserving a room')
  .withScenarioLayer(testLayer) // Reservations and Rooms over the test store; only the payment provider is a fake
  .withScope({ rooms: Rooms, reservations: Reservations })
  .body(({ scenario, background, scope }) => {
    background(emptyTheHotel)
    scenario(
      'a guest reserves the last free room',
      scope.pipe(
        Given('a hotel with one free double room')('room', ({ rooms }) => rooms.add({ kind: 'double' })),
        When('Grace reserves a double room')(
          'result',
          ({ reservations }) => reservations.execute(new Reserve({ guest: GRACE, kind: 'double' })),
        ),
        Then('Grace gets the last double room')(({ result }, expect) =>
          expect(result).toMatchObject({ status: 'confirmed', remaining: 0 })
        ),
      ),
    )
    scenario(
      'two guests race for the last room',
      scope.pipe(
        Given('a hotel with one free double room')(({ rooms }) => rooms.add({ kind: 'double' })),
        When('Grace and Henry reserve it at the same moment')('results', ({ reservations }) =>
          Effect.all([
            reservations.execute(new Reserve({ guest: GRACE, kind: 'double' })).pipe(Effect.result),
            reservations.execute(new Reserve({ guest: HENRY, kind: 'double' })).pipe(Effect.result),
          ], { concurrency: 2 })),
        Then('one guest gets the room and the other is told no rooms are free')(({ results }, expect) =>
          expect({
            granted: results.map(Result.isSuccess).sort(),
            refused: results.filter(Result.isFailure),
          }).toMatchObject({ granted: [false, true], refused: [Result.fail({ _tag: 'NoRoomsFree' })] })
        ),
      ),
    )
  })
```

Behaviour that needs the whole running system goes one level up instead: an effect-e2e test starts the shipped service and its dependencies (a compose environment or the platform's own dev server) and drives it through its public API or page, asserting only the response and what the API reads back.
