---
title: SQL testing is not BDD testing, whatever the file is called, and is deleted
applies_when:
  - writing or reviewing a test, Feature, contract suite or *.integration.test.ts that touches a database, store, repository or query
  - a Given, setup hook or test helper inserts, updates or deletes rows with SQL, a query builder, an ORM, migrations, ALTER or fixture loaders
  - a Then selects or counts rows from the database, or a failure is staged by breaking the schema
tags: [testing, bdd, sql, database, store, query, orm, migrations, integration]
---

SQL testing is **not** BDD testing. Any test whose steps reach the database out-of-band is SQL testing and must be deleted—regardless of whether it is named `*.integration.test.ts`, wrapped in `Feature`/`Given`/`When`/`Then`, called a contract suite, or run against a real database in a microVM.

A test is SQL testing if any setup, hook, helper, or step does any of the following:

- Seeds, updates, or deletes rows via raw SQL, `sql.unsafe`, a query builder, an ORM, or a test helper/factory that executes SQL or ORM writes under the hood instead of the system's own write operation.
- Runs migrations, creates or alters tables/columns, or loads fixture files directly into the database.
- Selects or counts rows in `Then` instead of reading what the consumer receives.
- Stages a failure by corrupting the schema (renaming a column, dropping a table) instead of a condition a consumer can trigger.

Delete the test immediately; never rename, re-suffix, or re-wrap it. Prove a query's behaviour instead with a Feature that runs the shipped system: its services in their platform's local runtime (a Cloudflare Worker's bundle in Miniflare) or as their release image in a microVM, its database and other resources in microVMs. Its Givens write state through the system's own write entry, its When calls the consumer entry, and its Then asserts the consumer's response.

```typescript
// WRONG: SQL or SQL-wrapping helper in Given, direct store read in When
Given('the guest has a booking')(() => sql.unsafe(`INSERT INTO bookings (guest, room) VALUES ('grace', 12)`))
When('the bookings are read')('rows', () => bookingStore.forGuest('grace'))
// RIGHT: the shipped Worker in Miniflare over a microVM database, driven through its own routes
Given('the guest booked room 12')(({ worker }) =>
  worker.dispatchFetch('http://app/bookings', { method: 'POST', body: '{"guest":"grace","room":12}' })
)
When('the guest lists their bookings')('res', ({ worker }) => worker.dispatchFetch('http://app/bookings?guest=grace'))
Then('room 12 is listed')(({ res }, expect) => expect(res).toMatchObject({ status: 200 }))
```
