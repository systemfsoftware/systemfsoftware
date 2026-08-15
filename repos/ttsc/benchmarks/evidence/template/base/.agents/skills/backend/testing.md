# Backend Testing

Tests under `packages/backend/test/` are executable proof of backend behavior. Read the requirements, generated accessors, and DTOs before writing a scenario. The SDK says what can be called; only the requirements say what must happen.

Keep the scaffold health test intact. It proves infrastructure, not a product requirement.

## Layout

```text
test/
  features/api/<domain>/test_api_<domain>_<behavior>.ts
  authorize/authorize_<actor>_<join|login|refresh>.ts
  prepare/prepare_random_<entity>.ts
  generate/generate_random_<accessor_path>.ts
```

- `features/`: one exported test function per file, named after the file.
- `authorize/`: one helper per authentication lifecycle operation.
- `prepare/`: synchronous creation-body builders with no calls.
- `generate/`: one public SDK call that returns the created value.

Names match the exported function and describe the behavior or refusal being proved.

## Operation Ownership

Every published operation has tests, sized by the requirements it realizes.

Each accessor states its own address in its JSDoc `@accessor` tag, so the operation list is exact. From `packages/backend`:

```bash
rg --no-filename -o '@accessor \S+' ../api/src/functional | sort
```

Each test has one primary operation: the accessor it exists to prove. Prerequisite calls that reach the state under test, and follow-up reads that observe the effect, are setup and observation rather than the subject.

| Rule | Detail |
| --- | --- |
| one primary operation | the accessor this test proves, named in its JSDoc scenario |
| at least one test per operation | every published operation has a proven working path |

How much further to go is yours to judge from the requirements. An operation whose requirements state a refusal, a boundary, or an ownership rule usually needs a test for each, and splitting them is how each one gets a name that says what it proves — `test_api_sale_unit_create_success` beside `test_api_sale_unit_create_rejects_foreign_seller`. An operation the requirements describe in one behavior needs one test.

## Scenario Shape

Every test JSDoc states the behavior, why the scenario proves it, and numbered steps. The body repeats those steps as comments.

```ts
/**
 * Proves a sale unit remains reachable through its owning sale.
 *
 * 1. Join an administrator and create the required section.
 * 2. Join a seller and create a sale in that section.
 * 3. Add a unit to the sale through the operation under test.
 * 4. Read the sale and assert it contains the unit.
 */
export async function test_api_sale_unit_belongs_to_sale(
  connection: api.IConnection,
): Promise<void> {
  // Step 1: Join an administrator and create the required section
  const admin: api.IConnection = { host: connection.host };
  await authorize_admin_join(admin, {});
  const section = await generate_random_admin_section_create(admin, {});

  // Step 2: Join a seller and create a sale in that section
  const seller: api.IConnection = { host: connection.host };
  await authorize_seller_join(seller, {});
  const sale = await generate_random_seller_sale_create(seller, {
    params: { sectionId: section.id },
  });

  // Step 3: Add a unit to the sale through the operation under test
  const unit = await api.functional.shopping.seller.sale.unit.create(seller, {
    params: { sectionId: section.id, saleId: sale.id },
    body: { name: "Standard", primary: true },
  });
  typia.assert(unit);

  // Step 4: Read the sale and assert it contains the unit
  const detail = await api.functional.shopping.seller.sale.at(seller, {
    id: sale.id,
  });
  typia.assert(detail);
  TestValidator.predicate(
    "sale contains the created unit",
    detail.units.some((elem) => elem.id === unit.id),
  );
}
```

The authorization, section, and sale calls establish the state the operation needs. The final read observes its effect. The unit creation is the primary operation, and it is the one this test's JSDoc names.

The final assertion observes the effect through a public read. Checking only the create response proves that the response echoed input, not that state persisted.

## Connections And Setup

The test's `connection` parameter supplies only the host. Create one connection per actor, authenticate it once through an authorize helper, and reuse it. Never write headers manually.

Setup uses public operations:

1. authenticate the actor for the next protected step;
2. create parents before children;
3. establish ownership, membership, grade, or approval through the operation that grants it;
4. switch actors explicitly; and
5. invoke the target behavior.

Do not seed the database directly. A required state that no public operation can establish is an API finding.

The database is shared across tests and repeated runs. Assert against records and identifiers created by the scenario, never global emptiness, total row count, or an unscoped position.

## Helpers

Prepare helpers preserve deliberate `null`:

```ts
export function prepare_random_sale(
  input?: DeepPartial<IShoppingSale.ICreate>,
): IShoppingSale.ICreate {
  return {
    title: input?.title ?? RandomGenerator.name(),
    closedAt:
      input?.closedAt !== undefined
        ? input.closedAt
        : null,
  };
}
```

Generate helpers call one existing accessor. Path parameters and foreign keys come from earlier public responses; random identifiers are valid only in an explicit not-found test.

## Coverage

For every requirement, name a test that would fail if the behavior disappeared. For every operation, cover its working path and every refusal the requirements state. For every exchanged DTO shape, construct or read it through an applicable operation.

Minimum behavioral cases:

| Contract | Proof |
| --- | --- |
| persisted mutation | successful response and observable follow-up state |
| list or search | filter, ordering, and pagination behavior |
| ownership or visibility | permitted and forbidden actors |
| threshold or window | both sides of the boundary |
| retained history | mutate the source, then read the retained value |
| delete with restore | content and ownership survive the full cycle |
| caller-controlled unique value | duplicate submission is refused |
| grade restriction | reachable sufficient and insufficient grades |

Do not invent negative cases the requirements or public contract do not state.

## Assertions

Use `typia.assert(response)` for the full response shape, then assert the business fact:

```ts
typia.assert(response);
TestValidator.equals("owner remains seller", response.seller.id, seller.id);
```

Every test needs a business assertion. Type validation alone proves only contract shape.

Assert the exact status or diagnosis when the public contract states it. Otherwise assert a generic refusal. Await both the refusal assertion and the SDK call inside it.

An effect the workspace cannot perform is asserted through the record that stands for it, never through its absence. `providers.md` owns that boundary; the test reads the row and checks the recipient, the payload, and the conditions the requirement puts on it.

A deliberately malformed wire payload cannot pass through the typed SDK. When a requirement promises runtime boundary refusal, isolate the invalid payload in a raw-HTTP helper and assert the public response without weakening production types.

## Test Integrity

Never:

- cast to reach a missing accessor;
- use `any`, double casts, or suppression comments;
- read Prisma directly for setup or proof;
- decode token internals the DTO does not expose;
- weaken an assertion to make the suite pass;
- present a prerequisite call as the operation under test; or
- prove one operation's success and refusal inside a single test.

## Running

Before provider realization, tests should fail against random-answer controller stubs. A green suite while material stubs remain means the assertions are insufficient.

From `packages/backend`:

```bash
pnpm test
```

The command compiles the `test/tsconfig.json` Program, which covers the tests together with the backend source, boots the application against SQLite, runs every exported test function, and closes it. It regenerates nothing, so run `pnpm build:sdk` after a contract change before relying on it.
