# DTOs

DTOs are the public request and response contract. Declare every requirement-derived DTO under `packages/api/src/structures/`, never inside the backend.

## Files And Exports

Keep the directory flat, one root interface per file:

```text
packages/api/src/structures/
  IShoppingSale.ts
  IShoppingSaleSnapshot.ts
  index.ts
```

Export every file directly from `structures/index.ts`, then through `src/index.ts`. Consumers import from the package entry only. `IEntity`, `IPage`, and `IDiagnosis` remain transport primitives under `src/typings/`.

Name a root interface from the full singular table name: `shopping_customer_sessions` becomes `IShoppingCustomerSession`. Variants use namespaces:

| Variant | Meaning |
| --- | --- |
| base | complete read shape |
| `.ISummary` | list item |
| `.ICreate` | caller-supplied creation fields |
| `.IUpdate` | mutable fields |
| `.IRequest` | pagination, search, filters, and sort |
| `.IJoin`, `.ILogin`, `.IRefresh` | authentication input |
| `.IAuthorized` | actor and issued authorization material |

Use `IPage<T>` for every multi-item response. Do not define a second page wrapper.

## Every Property Has A Source

Each root DTO maps to a requirement and a precise source: a model, operation, or named derivation. Each property maps to a column, relation, or stated derivation. A property with no source is a phantom and must be removed or its owning schema corrected.

Computed values state their derivation in JSDoc. “Computed” alone is not a derivation.

Every public type and property has useful JSDoc. State meaning, source, absence semantics, unit, scale, and security implications instead of restating the property name.

## Types And Tags

Tags are runtime boundary validation and OpenAPI constraints, not decoration:

```ts
id: string & tags.Format<"uuid">;
createdAt: string & tags.Format<"date-time">;
email: string & tags.Format<"email">;
quantity: number & tags.Type<"uint32"> & tags.Minimum<1>;
title: string & tags.MinLength<1> & tags.MaxLength<255>;
```

Match schema nullability in response-reachable variants. A create variant may require a value that becomes nullable later. Write nullable tagged values as:

```ts
closedAt: null | (string & tags.Format<"date-time">);
```

Use a literal union only when the requirements or another structured owner defines a closed public vocabulary. A property named `status` is not automatically an enum.

## Relations

| Relationship and direction | DTO shape |
| --- | --- |
| response needs related display data | target DTO or summary |
| response only correlates | scalar identifier |
| request associates an existing row | scalar identifier |
| request creates a composition child | nested child `.ICreate` |
| event-created collection | separate endpoint, optionally an aggregate count |

Response relation names drop `_id`; request identifiers use camelCase `Id`. Do not expose both an id and nested object for one edge without a requirement-backed reason.

Current versioned entities expose their current revision as `lastSnapshot`. Full history belongs to a dedicated endpoint.

## Listing Request

```ts
export namespace IShoppingSale {
  export interface IRequest extends IPage.IRequest {
    search?: null | IRequest.ISearch;
    sort?: null | IPage.Sort<IRequest.SortableColumns>;
  }
  export namespace IRequest {
    export interface ISearch {
      title?: null | string;
      sectionCodes?: null | string[];
    }
    export type SortableColumns =
      | "sale.created_at"
      | "sale.opened_at";
  }
}
```

Optional request fields use `?: null | T`. Sort uses ordered `+field` and `-field` tokens from the declared union.

## Credentials And Sessions

Never expose password hashes, persisted reset proofs, verification secrets, or external credentials. Plaintext credentials appear only in input DTOs.

`.IAuthorized` carries only what the authentication contract returns. Add refresh proof, deadlines, or connection context only when the requirements expose them. Do not copy another subject's session fields by habit.

## Completion

Before SDK generation, verify both directions:

- every caller-visible requirement concept has a DTO;
- every DTO and property has a real source;
- every caller-visible stored value reaches a read variant;
- every constraint, null state, unit, and enum matches its owner;
- no generated or outbound-provider wire type was published as a DTO; and
- every authored DTO is exported from the package entry.
