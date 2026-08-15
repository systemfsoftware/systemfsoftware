# Providers

Providers under `packages/backend/src/providers/` own business rules, authorization beyond route identity, visibility, database access, and transactions. Use exported namespaces with one `props` object per function. Do not add dependency injection.

## Layer Split

| Artifact | Owner |
| --- | --- |
| provider | rules, guards, filters, ordering, transaction boundary |
| transformer | Prisma selection and row-to-DTO mapping |
| collector | request-to-Prisma creation payload |
| controller | route guard and one provider call |

Providers reuse transformers and collectors instead of assembling equivalent objects inline.

## Actors And Authorization

An authenticated actor narrows through the stack:

| Layer | Type |
| --- | --- |
| controller and provider | `SellerPayload` or an explicit actor union |
| collector | `IEntity` when only the id is needed |
| transformer | no actor |

A payload contains only `id`, `session_id`, and a discriminating `type`. Authentication proves identity. Grade, membership, ownership, approval, and row scope are separate provider checks.

```ts
export interface SellerPayload {
  id: string & tags.Format<"uuid">;
  session_id: string & tags.Format<"uuid">;
  type: "seller";
}
```

The authorize provider verifies the token type and reads the current session joined to the active actor. A token without a live matching session is refused. Load mutable grade or membership from the database per protected request; do not freeze it inside the token.

Derive ownership from the target row:

```ts
const record = await MyGlobal.prisma.shopping_sales.findFirstOrThrow({
  where: { id: props.id },
  select: { id: true, shopping_seller_id: true },
});
if (record.shopping_seller_id !== props.seller.id)
  throw ErrorUtil.forbidden("Only the owning seller may edit this sale.");
```

When a relation grants additional permission, the owner still has it inherently. Accept `owner || membership`, not membership alone.

Global grades belong to the actor. Scope-relative roles belong to membership rows. A selected scope comes from the session, not a request body.

## Transformer

`pnpm build:prisma` writes the generated client under `src/prisma/`, and `packages/backend/tsconfig.json` maps the `@prisma/sdk` alias to it. Reach the generated `Prisma` types and `PrismaClient` through that alias, as `MyGlobal` does.

One transformer namespace owns one DTO's read side:

```ts
import { Prisma } from "@prisma/sdk";

export namespace ShoppingSaleTransformer {
  export type Payload = Prisma.shopping_salesGetPayload<
    ReturnType<typeof select>
  >;

  export function select() {
    return {
      select: {
        id: true,
        name: true,
        created_at: true,
        category: ShoppingCategoryTransformer.select(),
      },
    } satisfies Prisma.shopping_salesFindManyArgs;
  }

  export async function transform(input: Payload): Promise<IShoppingSale> {
    return {
      id: input.id,
      name: input.name,
      createdAt: input.created_at.toISOString(),
      category: await ShoppingCategoryTransformer.transform(input.category),
    } satisfies IShoppingSale;
  }
}
```

Do not annotate `select()`'s return type; `satisfies` validates without widening. Use nested `select`, never `include`. Every selected value is consumed and every returned property has a selected source.

Reuse neighboring transformer pairs: `Neighbor.select()` in the query and `Neighbor.transform()` in the mapping. Never query inside `transform`; select the needed rows or aggregates first. Counts come from `_count`, not loaded collections.

Convert dates to ISO strings and decimals to numbers at the DTO boundary. Map enums exhaustively. Derive computed values from selected sources and verify relation direction.

## Collector

One collector namespace owns one creation DTO's write side:

```ts
export namespace ShoppingSaleCollector {
  export async function collect(props: {
    body: IShoppingSale.ICreate;
    seller: IEntity;
  }) {
    return {
      id: v4(),
      name: props.body.name,
      created_at: new Date(),
      seller: { connect: { id: props.seller.id } },
      category: { connect: { id: props.body.categoryId } },
      parent: props.body.parentId
        ? { connect: { id: props.body.parentId } }
        : undefined,
    } satisfies Prisma.shopping_salesCreateInput;
  }
}
```

Use relation `connect`, not raw foreign-key assignment. `undefined` omits an optional relation; `null` is not a relation input. Reuse child collectors in nested creation and omit the parent connect when nesting already supplies it.

Compute derived storage forms inside the collector, including password hashes. A required value with no source in the body, actor/reference, related row, or documented semantic default reveals a contract or schema defect.

## Reads

Build one `where` object and reuse it for count and page:

```ts
const where = {
  AND: [
    ...visibility({ actor: props.actor }),
    ...(await search({ input: props.input.search })),
  ],
} satisfies Prisma.shopping_salesWhereInput;

const [records, rows] = await Promise.all([
  MyGlobal.prisma.shopping_sales.count({ where }),
  MyGlobal.prisma.shopping_sales.findMany({
    where,
    skip: (current - 1) * limit,
    take: limit,
    ...ShoppingSaleAtSummaryTransformer.select(),
  }),
]);
```

The total comes from `count`, not returned row length. Lists use bounded defaults. Detail reads apply the same visibility policy and use a throwing finder when absence is a `404`.

Centralize each entity's actor-dependent visibility and deletion rules. Build optional filters by conditional spreads. Map public sort tokens through an exhaustive whitelist and provide a deterministic fallback.

## Writes And Transactions

Create with the collector and return through the transformer:

```ts
const record = await MyGlobal.prisma.shopping_sales.create({
  data: await ShoppingSaleCollector.collect({
    body: props.body,
    seller: props.seller,
  }),
  ...ShoppingSaleTransformer.select(),
});
return ShoppingSaleTransformer.transform(record);
```

Keep all writes that establish one invariant in one transaction. A snapshot append and its current-pointer update are atomic. Re-read the response through the normal detail path instead of fabricating a full DTO from a narrow write result.

Physical deletion removes the target and lets declared cascades handle dependents. Soft deletion sets only the deletion marker so restore retains content and ownership. Do not cascade soft deletion into irreversible child writes.

Snapshot rows are append-only. Material rows are read-only except for explicitly maintained projection or current-pointer writes.

## Effects This Workspace Cannot Perform

A requirement may name an effect that leaves the system: mail to a verified address, a message to a device, a charge against a payment network, a call to a third party. The workspace has no transport for any of them and none will be added.

Record the effect instead of performing it. The record is a real table, written in the same transaction as the state that caused it, holding the recipient, the kind, the payload, and the time. Nothing about the requirement changes: the effect still happens at the moment the requirement says, carries what the requirement says, and is refused when the requirement says.

That record is the delivery boundary, and three rules follow from it.

- **A secret delivered out of band never returns to the caller.** A recovery proof, a one-time code, or a verification token belongs in the record and in nothing the operation responds with. Returning it publishes an account takeover, whatever the response property is called.
- **A flow that consumes such a secret reads it from the record.** An operation that verifies a proof no operation can issue is unreachable code behind a published route.
- **Discarding the effect is not an implementation.** A comment naming the transport that would have sent it leaves the requirement unmet and the omission invisible.

Tests assert against the record: the row exists, addresses the right recipient, carries the right payload, and appears only under the conditions the requirement states. That is what makes an unperformable effect observable, and it is the whole reason it is stored rather than simulated at the call site.

## Errors And Boundary Validation

Throw through `ErrorUtil` with the public meaning:

```ts
throw ErrorUtil.forbidden("Only the owning seller may edit this sale.");
throw ErrorUtil.notFound("No such sale.");
throw ErrorUtil.unprocessable(diagnoses);
```

Do not leak Prisma messages or throw plain `Error`. The shared Prisma mapper registered during bootstrap converts known database failures without exposing schema details.

Do not repeat runtime type or format checks already enforced by typed DTO boundaries. Providers still own business constraints, state transitions, uniqueness not guaranteed by the schema, and authorization.

## SQLite And Common Traps

- Prisma inputs use relation property names, not table names.
- A missing query-result property was not selected.
- Use `undefined` to omit an optional create relation.
- SQLite has no Prisma case-insensitive `mode`; normalize into a requirement-backed stored value when needed.
- Do not use `any`, double casts, ignores, generated-file edits, or arbitrary defaults.
- `null` must retain the exact meaning documented by the schema. A current-time fallback on an absent expiry usually means “already expired.”
- A filter, data object, or promise that is created but never passed or awaited is a silent no-op.

## Verification

Review every public operation, every behavior-bearing requirement, and every schema invariant against the complete provider population. Then walk every provider branch backward to its requirement, contract, or schema owner.

Confirm every effect and refusal is implemented everywhere it applies, every read applies visibility and deletion rules, every response property has a real source, every retained value is captured at the required event, and no invented branch remains. Builds prove shapes; backend tests prove observable behavior.
