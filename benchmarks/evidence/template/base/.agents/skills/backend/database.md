# Database

The schema under `packages/backend/prisma/schema/` owns every persisted fact, relation, constraint, and lifecycle state.

## Files

Keep `main.prisma` limited to the SQLite datasource and generators. Put requirement-derived models in ordered domain files:

```text
prisma/schema/
  main.prisma
  schema-01-identity.prisma
  schema-02-domain.prisma
```

The connection URL belongs in `prisma.config.ts`, not the schema. Prisma parses the folder as one schema.

## Model From Requirements

Every table and column must answer a requirement. Persist facts a row owns, point-in-time captured values, and explicitly required materialized values. Do not store live aggregates, duplicate another table's fact for display convenience, or hide queryable structure in JSON or encoded strings.

| Value | Prisma type |
| --- | --- |
| text, UUID, semantic string | `String` |
| count or ordinal | `Int` |
| approximate measurement | `Float` |
| money, tax, balance | `Decimal` |
| flag with no third state | `Boolean` |
| instant or UTC-normalized calendar date | `DateTime` |

Money that may vary by currency stores the currency code. A posted cross-currency amount also stores the rate and converted value honored at posting time.

Every primary key is `id String @id` and is assigned as a UUID by the application. Foreign keys use the singular target table name plus `_id`.

## Lifecycle Stance

Choose each model's stance before designing endpoints:

| Stance | Meaning |
| --- | --- |
| actor | authentication identity with its own lifecycle |
| session | one authenticated connection |
| primary | independently managed business entity |
| subsidiary | managed through a parent |
| snapshot | immutable point-in-time record |
| material | read-only `mv_*` projection or maintained pointer |

Use `created_at` on every model. Mutable entities may add `updated_at`; retained entities may add `deleted_at` when restore, moderation, audit, or permanent child references require the row to survive deletion. Snapshots, logs, and join rows normally have only `created_at`.

A recovery requirement needs recoverable state. A snapshot must copy enough requirement-scoped values to reconstruct the past after the source changes. A live foreign key to mutable data is not historical retention.

## Relations

Declare the foreign key and both relation directions. Use semantic camelCase relation names; several links to the same table need distinct names.

- **Association:** the related row already exists and has its own lifecycle.
- **Composition:** the child belongs to the parent's lifecycle and is created through it. Its parent foreign key is non-null.

Use a dependent table with a unique parent foreign key for an optional one-to-one detail. Use subtype tables when exactly one of several actor or target kinds owns a row; several nullable owner keys cannot enforce exactly one owner.

Keep one owner for tenant or scope identity. Descendants reach it through required parent relations instead of duplicating the scope key.

## Complete Model Example

```prisma
/// Seller sale with immutable revisions in {@link shopping_sale_snapshots}.
///
/// @namespace Sales
model shopping_sales {
  /// Primary key.
  id String @id

  /// Owning seller's {@link shopping_sellers.id}.
  shopping_seller_id String

  /// Creation instant.
  created_at DateTime

  /// Opening instant. `null` means not opened yet.
  opened_at DateTime?

  /// Closing instant. `null` means no scheduled close.
  closed_at DateTime?

  /// Owning seller.
  seller shopping_sellers @relation(fields: [shopping_seller_id], references: [id], onDelete: Cascade)

  /// Immutable revisions.
  snapshots shopping_sale_snapshots[]

  /// Current revision pointer.
  mvLast mv_shopping_sale_last_snapshots?

  @@index([shopping_seller_id])
  @@index([created_at])
}
```

Every model and field needs a `///` comment because comments reach the generated client and `docs/ERD.md`. A nullable field states what `null` means. Link models and fields with `{@link model}` and `{@link model.field}`.

## Constraints And Representability

Put business uniqueness in `@@unique`; provider prechecks alone do not survive concurrency. Index requirement-backed filters and sorts.

For every model, ask both:

1. Can it represent every state the requirements allow?
2. Can it represent a state the requirements forbid?

Common defects:

| Wrong shape | Correct direction |
| --- | --- |
| aggregate column on a base table | query it or use an explicit `mv_*` projection |
| nullable cluster representing one detail | dependent one-to-one table |
| several nullable actor or target keys | subtype tables |
| current value duplicated in two writable stores | one current owner; history remains audit |
| hard-deletable parent with permanent children | soft delete, retained copy, or explicit unlink |
| unique target on repeatable submission | include the submitting actor |
| unique foreign key on repeatable history | indexed non-unique foreign key |
| `updated_at` on immutable history | `created_at` only |
| live relation used as an as-of snapshot | copy the retained values |
| effect that leaves the system with nowhere to be recorded | a table the provider writes it to, see `providers.md` |

## Completion

Before generation, verify:

- every persistent requirement maps to the exact models and fields it needs;
- every model and field maps back to a requirement;
- every nullable, deletion, retention, uniqueness, and ownership decision is explicit;
- no invented table, column, projection, or snapshot remains; and
- every required public or provider path can reach the model.

Then run `pnpm build:prisma` and `pnpm schema`.
