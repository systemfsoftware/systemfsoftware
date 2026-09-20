---
title: Outside boundary data must be decoded into validated domain types, never asserted with type casts
applies_when:
  - receiving data from network requests, HTTP bodies, query params, or IPC
  - reading serialized formats (JSON, TOML, YAML, CSV) from disk or environment variables
  - loading rows from database queries or key-value caches
  - interacting with external untrusted systems or third-party APIs
tags: [cell-architecture, decode-never-cast, schema, parse, boundary, validation]
---

# Outside boundary data must be decoded into validated domain types, never asserted with type casts

All outside data crossing the system boundary (network payload, disk byte, database row, environment variable) enters untyped and unverified. It must be turned into a domain type via explicit schema decoding that returns a typed `Result` or `Effect` (`CONSTITUTION.md` CONST-B5).

Unchecked TypeScript type casts (`as`, `as unknown as`, `as any`) or type assertion functions on external data are strictly prohibited.

## Doctrine & Constraints

- **Parse, Don't Validate**: Do not inspect data with ad-hoc booleans and then cast it. Decode it through a Schema (e.g. `Schema.decodeUnknown` or `Schema.decode`) that constructs the branded or typed domain value.
- **No Casts on External Payloads**: An unchecked cast creates a phantom shape that nothing verified; everything downstream trusts a guarantee that was never executed.
- **Fail with Structured Errors**: A decoding failure must produce a structured, actionable error (e.g. `ParseResult.ParseError`), not throw unhandled runtime exceptions.
- **Branding at the Seam**: Primitive domain values (UserIds, OrderIds, Currency amounts) must be branded during decoding so primitive obsession is eradicated from the pure core.

## Calibration Examples

- **wrong**:
  ```ts
  // Unchecked type cast on external request body
  app.post('/orders', async (req, res) => {
    const command = req.body as CreateOrderCommand // Dangerous lie: nothing verified this shape
    processOrder(command)
  })
  ```
- **right**:
  ```ts
  // Schema-decoded boundary parsing
  import * as S from 'effect/Schema'

  export class CreateOrderCommand extends S.TaggedClass<CreateOrderCommand>()('CreateOrderCommand', {
    orderId: S.String,
    amount: S.PositiveNumber,
  }) {}

  const decodeCommand = S.decodeUnknown(CreateOrderCommand)

  // In shell / handler:
  const handleRequest = (raw: unknown) =>
    Effect.gen(function*() {
      const command = yield* decodeCommand(raw) // Returns ParseError if invalid
      return yield* processOrder(command)
    })
  ```

## Verification & Gate

- `lint`: Static analysis rejects `as` assertions on external parameters and disallows suppression comments on boundary parsing.
- `review`: Reviewer verifies that all inputs from HTTP, filesystem, CLI arguments, and databases pass through a Schema decoder before reaching domain functions.
