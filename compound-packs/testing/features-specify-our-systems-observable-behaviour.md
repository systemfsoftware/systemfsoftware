---
title: A Feature specifies our system's observable behaviour in its consumer's language; Given sets state, one When drives the consumer entry, and Then reads only consumer outcomes
applies_when:
  - adding, renaming or reviewing an effect-gherkin-spec Feature, scenario or scenario outline
  - writing Feature, scenario or step text
  - a When calls a layer, decoder, schema, constructor or internal helper directly
  - a Given does nothing, runs the action under test, or has no scenario layer backing it
  - a Then reads a database table, store internals, or a third-party stand-in's wire record
tags: [testing, behaviour-test, bdd, gherkin, feature, given-when-then, scenario-outline]
---

A Feature specifies one capability of our system in the consumer's terms (the user, calling code, or operator) and names that capability in its file and title (`placing-an-order.integration.test.ts`, "Placing an order"). Never make a third party, its wire format, a protocol, library, configuration layer, schema, decoder, or internal unit the subject.

Given prepares starting state via fixtures, fake parameters, or the system's own operations; it never runs the When action, returns nothing asserted, and produces every fact its text claims. A scenario has one When that drives the exact entry production consumers use (published operation, route, command, page)—never a rebuilt fixture or internal helper. Scenario outline rows vary inputs and outcomes of one When, never which unit is called.

Then reads only what the consumer observes: the entry's return value or tagged failure, state read back through our system's own operations, or what our system sent through an outbound port read in that port's terms via its contract-suite fake's read operation. Never query a store directly in Then, never assert raw vendor responses or a stand-in's wire-level request log, and never name internal units, files, layers, or unexposed settings in step text.

## Rubric

Judge each scenario by its step bodies and layers, never by retitled text:

1. **Consumer entry:** Does every When drive the same entry production consumers call?
2. **Real Givens:** Does every Given produce each fact its text claims (unless asserting an initially empty world)?
3. **Consumer Then:** Does every Then assert only the entry's outcome, state read back via our system's operations, or an outbound port fake's port-level read operation?
4. **Real or contract-proven services:** Does every reached service run its real layer or a port fake exercised in that port's contract suite (never `Layer.succeed` object literals or partial shapes, except `<Feature>Config` settings)?
5. **Backed world:** Does `.withScenarioLayer(...)` provide the world the Givens claim (not `Layer.empty` under stateful Givens)?
6. **Declarative text:** Does step wording describe _what_ happens in consumer terms without naming internal functions, layers, wire formats, or unexposed settings?

**Verdict:** If a scenario fails 1, 2, 4, 5, or 6, delete it; if its Then checked a real consumer outcome (or queried our store for one, failing 3), replace it in the same change with a valid scenario, running the shipped system when it needs real IO (`sql-tests-are-not-behaviour-tests.md`). If a scenario fails 3 alone by querying our store directly, rewrite only the Then to read through our system's operations.

```typescript
// WRONG: internal layer/stubs, no-op Given, wire-level stand-in assertion
Given('a hotel with one free double room')(() => Effect.void),
When('the handler runs')('res', () => handlers.handle('reserve', input).pipe(Effect.provide(inlineStubs))),
Then('the provider receives HTTP POST')((_, expect) => expect(peer.received).toHaveLength(1)),
// RIGHT: real services over test store, consumer entry, consumer-observable outcome
Given('a hotel with one free double room')('room', ({ rooms }) => rooms.add({ kind: 'double' })),
When('Grace reserves a double room')('res', ({ reservations }) => reservations.execute(new Reserve({ guest: GRACE, kind: 'double' }))),
Then('Grace gets the last double room')(({ res }, expect) => expect(res).toMatchObject({ status: 'confirmed', remaining: 0 })),
```
