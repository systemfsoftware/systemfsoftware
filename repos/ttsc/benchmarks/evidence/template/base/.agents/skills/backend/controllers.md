# Controllers

Controllers under `packages/backend/src/controllers/` own routes, actor guards, typed parameters and bodies, response types, delegation, and published JSDoc. Business logic and database access belong in providers.

## Declare The Contract Before Logic

Every requirement-derived operation begins as a complete contract with a temporary typed body:

```ts
@Controller("shopping/seller/sale")
export class ShoppingSellerSaleController {
  /**
   * List the seller's own sales.
   *
   * Implementation pending: realize with ShoppingSaleProvider.index.
   *
   * @param input Pagination, filters, and sort order
   * @returns One page of the seller's sales
   * @tag Sale
   */
  @core.TypedRoute.Patch()
  public async index(
    @SellerAuth() seller: SellerPayload,
    @core.TypedBody() input: IShoppingSale.IRequest,
  ): Promise<IPage<IShoppingSale.ISummary>> {
    seller;
    input;
    return typia.random<IPage<IShoppingSale.ISummary>>();
  }
}
```

This allows SDK generation and test authoring before provider logic exists. When realizing it, remove the stub marker and replace the body with one provider call. Do not renegotiate the route, signature, or published behavior to fit a convenient implementation.

## Operation Grammar

| Name | Method | Shape |
| --- | --- | --- |
| `index` | PATCH | request body to `IPage<ISummary>` |
| `at` | GET | one identified detail |
| `create` | POST | creation body to detail |
| `update` | PUT | update body and id to detail |
| `erase` | DELETE | delete by id |
| `restore` | PUT | `.../{id}/restore` |

Use a domain verb only for a distinct workflow. GET and DELETE have no request body. POST, PUT, and PATCH do. Every path parameter has exactly one typed declaration and never duplicates a body field.

A protected route begins with the service and calling actor:

```text
/shopping/seller/sale
/shopping/customer/order/{id}
/shopping/admin/member/{id}
```

A public route has no actor segment. Actor identity comes from the session, never a path or body. The target row's final path parameter is always bare `{id}`. Required foreign-key ancestors appear root-first; stop at an optional parent.

Use singular camelCase resource segments derived from schema nouns. One schema has one path family. A scope selected in the session stays out of every ordinary resource path.

## Authentication Operations

Implement only lifecycle operations the requirements define:

| Operation | Route | Request |
| --- | --- | --- |
| join | `POST /<service>/auth/<actor>/join` | `.IJoin` |
| login | `POST /<service>/auth/<actor>/login` | `.ILogin` |
| refresh | `POST /<service>/auth/<actor>/refresh` | `.IRefresh` |

Each returns `.IAuthorized` and declares:

```ts
/**
 * @setHeader token.access Authorization
 */
```

Session listing or revocation, password change, reset requests, verification, withdrawal, and external connections are ordinary resource operations. “Logout” is local token disposal unless the requirements define server-side session revocation.

Grades and scoped roles need public grant and removal operations when the requirements allow them. An unreachable authority makes every operation guarded by it untestable.

## Cardinality And Coverage

Read response cardinality from the requirement. Any many-item response uses `IPage<T>`, including bounded collections.

For every requirement, identify the operation that exposes its behavior or observable result. For every model and caller-visible field, identify the operation that reads or writes it, or record why it remains internal. Schema presence alone does not justify CRUD.

Primary entities require separate decisions for listing, creation, detail, update, deletion, and each named transition. Snapshots are read or append-only; materials are read-only except for maintained pointers.

## Published JSDoc

Controller JSDoc becomes SDK and OpenAPI documentation. Each operation states:

- purpose and actor;
- visibility, ownership, grade, and scope boundaries;
- success effects and state transitions;
- every public refusal;
- parameter and response meaning;
- sibling operation guidance when relevant;
- `@tag`; and
- `@setHeader` when the SDK must retain issued authorization.

```ts
@Controller("shopping/seller/sale")
export class ShoppingSellerSaleController {
  /**
   * Get one sale owned by this seller.
   *
   * Returns the complete SKU tree. Rejects with `403` when another seller
   * owns the sale and `404` when no visible sale has this identifier.
   *
   * @param id Target sale identifier
   * @returns The complete sale
   * @tag Sale
   */
  @core.TypedRoute.Get(":id")
  public async at(
    @SellerAuth() seller: SellerPayload,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<IShoppingSale> {
    return ShoppingSaleProvider.at({ seller, id });
  }
}
```

Use typed Nestia route, body, and parameter decorators. One actor/resource controller carries one explicit guard. The controller resolves the actor, delegates, and returns.

## After Contract Changes

When the complete contract settles, run `pnpm build:sdk` once and inspect the generated accessors before tests or frontend code consume them. Validate the complete backend draft at the prescribed compiler gate.
