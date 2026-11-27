---
title: A Feature specifies our system's observable behaviour in consumer terms, never SQL or vendor wire formats
applies_when:
  - adding, renaming or reviewing a Feature, scenario or scenario outline
  - adding or reviewing a repository, store or query test that seeds rows or inspects tables
  - a When calling an internal helper, or a Given or Then touching SQL, migrations or a stand-in's wire log
tags: [testing, bdd, feature, given-when-then, sql, database, assertions]
---

A Feature specifies one capability of our system in the consumer's terms (the user, calling code, or operator) and names that capability in its file and title (`placing-an-order.integration.test.ts`, "Placing an order"). Never make a third party, its wire format, a protocol, configuration, schema, decoder, or internal unit the subject.

Given prepares starting state via fixtures, fake parameters, or our system's own write operations; it never runs the When action, returns nothing asserted, and produces every fact its text claims. A scenario has one When that drives the exact entry production consumers use (published operation, route, command, page)—never an internal helper or rebuilt fixture. Scenario outline rows vary inputs and outcomes of one When, never which unit is called.

Then reads only what the consumer observes: the entry's return value or tagged failure, state read back through our system's own operations, or outbound effects read in port terms via an outbound port fake (`port-fakes-share-a-contract-suite.md`). Never query a store directly in Then, never assert raw vendor responses or a stand-in's wire request log, and never name internal units, files, layers, or unexposed settings in step text.

SQL testing is never BDD testing, whatever its file suffix or `Feature` wrapper, even when it is called a contract suite or runs against a real database. Delete immediately any test whose setup, helper, or step seeds or mutates rows via SQL, a query builder, an ORM, migrations, `ALTER`, or direct fixture loads; selects or counts rows in `Then`; or stages a failure by corrupting the schema. Never rename, re-suffix or re-wrap such a test to keep it. Prove a stored query's behaviour instead with a Feature running the shipped system, its services in their local runtime or as their release image in a scoped microVM and its database in the lightest engine tier that supports the SQL it exercises (pack: testing, integration-io-runs-in-the-lightest-scoped-engine.md), writing through the system's own write entry and reading through its consumer entry (for database adapter contract cases, see `adapters-run-against-real-local-resources.md`).

Judge every scenario against the six-point rubric in `references/feature-rubric.md`.

```typescript
// WRONG: SQL seeding in Given, internal store read in When
Given('the guest has a booking')(() => sql.unsafe(`INSERT INTO bookings (guest, room) VALUES ('grace', 12)`))
When('the bookings are read')('rows', () => bookingStore.forGuest('grace'))
// RIGHT: shipped system driven through its own write and consumer read entries
Given('the guest booked room 12')(({ app }) =>
  app.fetch('http://app.example/bookings', { method: 'POST', body: '{"guest":"grace","room":12}' })
)
When('the guest lists their bookings')(
  'bookings',
  ({ app }) => app.fetch('http://app.example/bookings?guest=grace').then((r) => r.json()),
)
Then('room 12 is listed')(({ bookings }, expect) => expect(bookings).toEqual([{ guest: 'grace', room: 12 }]))
```
