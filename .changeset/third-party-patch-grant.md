---
"@systemfsoftware/opt-in": minor
---

Add the `ThirdPartyPatch` grant: `{ dependency, patch, recheck }`, where `dependency` is the
`name@version` key from `pnpm-workspace.yaml`'s `patchedDependencies`, `patch` is the repo-relative
patch path, and `recheck` states what to re-run on upgrade and when to drop the patch. The debt
ledger's `pnpm-patch` channel declares each listed patch against this grant.
