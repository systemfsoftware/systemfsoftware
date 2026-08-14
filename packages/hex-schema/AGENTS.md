# AGENTS.md — `@systemfsoftware/hex-schema`

> **Location:** `packages/hex-schema/` — Effect `Schema` definitions for hexadecimal wire formats.

Branded hex-type schemas for strict, colon-delimited, prefixed, and byte-level representations.

- **HEX-V1 — no hand-written codec-law properties here.** `grep -rnE 'S\.equivalence' packages/hex-schema/src` returns nothing; rely on the injected law tests (contract: `packages/effect-schema-vite/AGENTS.md`).

| Check | Command                                               |
| ----- | ----------------------------------------------------- |
| Types | `pnpm --filter @systemfsoftware/hex-schema typecheck` |
| Test  | `pnpm --filter @systemfsoftware/hex-schema test`      |
| Lint  | `pnpm --filter @systemfsoftware/hex-schema lint`      |
