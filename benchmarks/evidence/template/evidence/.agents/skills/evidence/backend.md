# Evidence Backend

## Claims

| Claim | Host | References | Declared in |
| --- | --- | --- | --- |
| `schema-models` | Prisma models | requirement H2/H3 | `packages/backend/test/lint.config.ts` |
| `api-operations` | exported controller functions | requirement H2/H3 and Prisma models | `packages/backend/test/lint.config.ts` |
| `dto-types` | exported DTO types | requirement H2/H3 and Prisma models | `packages/api/lint.config.ts` |
| `dto-properties` | exported DTO properties | Prisma columns | `packages/api/lint.config.ts` |
| `backend-tests` | exported test functions | requirements and SDK operations | `packages/backend/test/lint.config.ts` |

The DTO claims live in the API package because a TypeScript claim selects only files its own `tsconfig` includes, and the API Program is the one that includes `src/structures/`. They are checked by backend `pnpm build:sdk`, which compiles the API package.

Every other backend rule lives in the test configuration because `test/tsconfig.json` compiles `../src` together with the tests — the one backend Program that holds controllers and test functions alike — and `pnpm check:watch` runs exactly that Program. `packages/backend/lint.config.ts` stays as shipped: `nestia all` inside `pnpm build:sdk` resolves the package configuration, so leaving it untouched keeps SDK generation free of evidence rules.

## File Rules

`packages/backend/test/lint.config.ts` also declares `evidence/singular` at `error`, with `evidence/review` and `evidence/todo` both staged at `"off"`. Both apply to the whole test Program — `packages/backend/src/**` and `packages/backend/test/**` — and to nothing else. `src/prisma/**` is ignored as generated output, and the configuration file itself is ignored. `packages/api` and `packages/frontend` are other Programs and carry neither rule.

**`evidence/singular` — one public identity per file, named after the file.** Declaration merging counts as one identity: the scaffold's own `src/MyGlobal.ts` exports a class and a namespace of that name and passes. A second unrelated export does not.

| File | Its one identity |
| --- | --- |
| `src/controllers/ShoppingSaleController.ts` | `export class ShoppingSaleController` |
| `src/providers/ShoppingSaleProvider.ts` | `export namespace ShoppingSaleProvider` |
| `src/providers/ShoppingSaleTransformer.ts` | `export namespace ShoppingSaleTransformer` |
| `test/features/api/shopping/test_api_sale_create.ts` | `export async function test_api_sale_create` |

Split a second export into its own file rather than renaming one to hide it. A payload interface a controller needs belongs beside the guard that produces it, not appended to the controller.

**`evidence/todo` — every remaining JSDoc `@todo` fails the build**, exported or not, with the tag's own text. It ships at `"off"` and is staged like a claim, because the backend declares its contracts as stubs before any provider exists.

Write the temporary controller stub's marker as `@todo <specific remaining implementation>`, in place of the prose marker `.agents/skills/backend/controllers.md` shows. The tag stays until the provider replaces the stub body.

## Placement

| Claim | `@evidence` host | Exclusion carrier |
| --- | --- | --- |
| `schema-models` | model `///` comment | `prisma/schema/exclude.schema` |
| `dto-types`, `dto-properties` | exported type or property JSDoc | `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` |
| `api-operations` | controller method JSDoc | `src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` |
| `backend-tests` | exported test function JSDoc | `test/features/TEST_EVIDENCE_EXCLUDE.ts`, requirements only |

Those four carriers are the only place a backend `@evidenceExclude` may be written:

- `packages/backend/prisma/schema/exclude.schema`
- `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts`
- `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts`
- `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts`

Each claim declares its carrier through `evidenceExcludeCarriers`, so an exclusion written anywhere else is a build error naming the file it belongs in. Each carrier ships with a JSDoc block stating what it accepts; read it before adding an entry. `backend-tests` accepts an exclusion for a requirement only — its operation reference refuses one, so a published operation with no test stays a build failure.

## Examples

Each block shows a finished acknowledgement, tag and review together. Backend Start writes the tags; Backend Review turns `evidence/review` on and adds the reviews as it checks each one.


```prisma
/// Sale persisted for one seller.
///
/// @evidence docs/analysis/02-domain-model.md#sale Stores the required sale
///           identity, lifecycle, and seller ownership.
/// @evidenceReview docs/analysis/02-domain-model.md#sale Read the section and
///                 checked each named field against this model's columns.
model shopping_sales {
}
```

```ts
/**
 * Public sale summary.
 *
 * @evidence docs/analysis/02-domain-model.md#sale-summary Exposes the summary
 *           fields customers use while browsing.
 * @evidenceReview docs/analysis/02-domain-model.md#sale-summary Read the section
 *                 and matched every browsing field it names to a property here.
 * @evidence prisma:shopping_sales Represents the persisted sale.
 * @evidenceReview prisma:shopping_sales Compared this type's properties against
 *                 the model's columns.
 */
export interface IShoppingSale {
  /**
   * Current title.
   *
   * @evidence prisma:shopping_sales.title Carries the stored title.
   * @evidenceReview prisma:shopping_sales.title Checked the column's type and
   *                 nullability against this property.
   */
  title: string;
}
```

```ts
/**
 * Lists sales visible to this seller.
 *
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Provides
 *           the seller's visibility-filtered browsing operation.
 * @evidenceReview docs/analysis/03-functional-requirements.md#browse-sales Read
 *                 the section and ran the browse test: visibility filter,
 *                 pagination bounds, and the other seller's rows absent.
 * @evidence prisma:shopping_sales Exposes persisted sales.
 */
public async index(): Promise<IPage<IShoppingSale.ISummary>> {
  // ...
}
```

```ts
import * as api from "{{apiPackageName}}";

/**
 * @evidence docs/analysis/03-functional-requirements.md#place-order Proves the
 *           order placement the requirement promises.
 * @evidenceReview docs/analysis/03-functional-requirements.md#place-order Read
 *                 the section and ran this test: order created, stock reserved,
 *                 and the empty-cart refusal.
 * @evidence {@link api.functional.shopping.order.create} Proves the published
 *           order creation operation.
 */
export async function test_api_order_create(
  connection: api.IConnection,
): Promise<void> {
  // ...
}
```

## Exclusions

```ts
/**
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only wording; this
 *                  exclusion becomes false if the API must return it.
 * @evidenceExcludeReview docs/analysis/05-user-experience.md#empty-state-copy
 *                        Read the section, found CatalogPage renders the copy,
 *                        and confirmed no operation returns it.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
```

Schema exclusions are unattached top-level `/// @evidenceExclude` lines in `exclude.schema`, a lint-only file that is not a Prisma generation input.

## Operation Reference

The `backend-tests` operation reference refuses `@evidenceExclude` and admits exactly one operation per test: every published operation is proved by a backend test, or the product is incomplete. Cite the one operation the test proves; write a missing test instead of excluding its operation.

Prerequisite and follow-up calls are setup and observation; leave them uncited.

## Staged Unlock

Start backend `pnpm check:watch` before implementation while every backend claim is disabled. Unlock each claim at exactly the point its layer completes — after that layer's last artifact, before the next layer's first. Both directions are wrong, and neither is the safe one:

- **Too early:** the watcher erupts with thousands of evidence errors for models, operations, and tags not yet written, polluting context and burying real diagnostics.
- **Too late:** the layer's obligations arrive as one huge batch after work has moved on. Coverage gaps — a requirement no model, operation, or test answers — surface only then, when fixing them reopens finished layers, and tags retrofitted in bulk drift toward compiler-satisfying filler instead of truthful mappings. Carrying every claim to the end turns the review that follows into the authorship this stage was supposed to finish.

Unlocking on time is what keeps each batch small enough to answer truthfully. A claim opened at its own layer asks about artifacts still in hand; the same claim opened three layers later asks about work already declared done.

1. After the complete schema passes `pnpm build:prisma` and `pnpm schema`, delete `disabled` from `schema-models` in `packages/backend/test/lint.config.ts`.
2. After every DTO and controller is complete and `pnpm build:sdk` passes, delete `disabled` from `dto-types` and `dto-properties` in `packages/api/lint.config.ts` and from `api-operations` in `packages/backend/test/lint.config.ts`.
3. After every public-operation test is written, delete `disabled` from `backend-tests` in `packages/backend/test/lint.config.ts`.
4. In the same file, delete the comment above `"evidence/todo"` and set it to `"error"`. Every stub still carrying a `@todo` now reports itself with its own text, which is the list of providers left to write.
5. Work that list down with the watcher running: replace each controller stub with its provider call and delete the `@todo` it carried. Then run `pnpm test` and fix every failure.

After each deletion, fix the complete diagnostic batch, complete the truthful evidence mappings, and wait for a rebuild without diagnostics before continuing to the next stage.

Keep the watcher running through Overall Final; `pnpm test` does not report every type or lint diagnostic.

Before the phase completes, this sweep must return nothing:

```bash
rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'
```
