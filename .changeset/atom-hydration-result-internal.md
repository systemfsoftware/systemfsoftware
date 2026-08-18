---
'@systemfsoftware/effect-atom': major
---

The `result` member is removed from the `DehydratedAtomValue` type returned by `dehydrate`.

- `DehydratedAtomValue.result` was a `Deferred` that completed when an initially-loading atom reached a real value. It never survived serialization, so it could not work across the process boundary the dehydrated state exists for; reading it after transport failed at runtime.
- The pending-update behaviour is unchanged: entries created with `encodeInitialAs: 'deferred'` still settle the target registry once `hydrate` applies them and the source atom resolves.
- Wait for all pending updates by joining the fiber that `hydrate` returns, as before.
- Code that read `entry.result` directly no longer compiles; drop that access — there is no replacement field.
