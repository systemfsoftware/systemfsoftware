# TypeScript, Typia, And Prisma Diagnostics

Fix the owning artifact. Never use `any`, double casts, suppression comments, or widened signatures to silence a diagnostic.

## Common Diagnostics

| Symptom | Cause | Correct fix |
| --- | --- | --- |
| tagged primitives do not overlap | incompatible refinements | prove the base with `value satisfies T as T` |
| `Date` is not assignable to date-time string | Prisma returns `Date` | `.toISOString()`; preserve `null` when nullable |
| `Format<"uuid">` mismatch | missing `tags.` prefix | `string & tags.Format<"uuid">` |
| `T \| undefined` remains after `typia.assert` | return value was ignored | use the return or `typia.assertGuard(value!)` |
| string not assignable to a literal union | open input reaches closed contract | runtime assert or exhaustive map |
| property on `never` | earlier guard already narrowed it, or a selection contains `null` | remove the duplicate guard or fix the selection |
| optional array has no `.map` | optional chain ended before the array | `(items ?? []).map(...)` |
| duplicate block variable in `switch` | cases share one scope | wrap each case body |
| check removed `undefined` but not `null` | the type has three states | branch explicitly or use `!= null` when equivalent |
| decimal not assignable to number | Prisma decimal crosses the API boundary | `Number(value)` |
| sort direction widens to string | branch literal widening | preserve `"asc" as const` |
| Prisma field absent from query result | it was not selected | add the scalar or relation to `select` |
| Prisma create/select rejects a name | table name used instead of relation property | use the schema relation name |

## Preserve Meaning

`T | null | undefined` often means:

- `undefined`: leave unchanged;
- `null`: clear;
- value: set.

Do not collapse these states unless the contract says they are equivalent.

A default must encode the documented meaning:

```ts
// Wrong when null means no expiry: immediately expired.
expiredAt: (row.expired_at ?? new Date()).toISOString(),

// Prefer preserving null when the DTO allows it.
expiredAt: row.expired_at?.toISOString() ?? null,
```

If a nullable source feeds a required target, first check whether the DTO or schema is wrong. Do not invent a plausible value merely to compile.

## Remove Dead Checks

Typed Nestia boundaries already validate DTO types, formats, and declared ranges. Delete repeated provider regexes and primitive checks. Keep business-rule validation.

When the same diagnostic recurs across a file, stop patching lines and re-derive the function from its contract and selection. Repetition usually points to one wrong upstream assumption.
