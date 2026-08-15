---
name: backend
description: Defines backend layer ownership, implementation order, compiler checking, generation boundaries, and the backend gate. Read before backend work, then read every sibling topic.
---

# Backend

The backend realizes the requirements as a schema, public contract, business logic, and executable tests. Work in that order so each layer consumes settled decisions from the layer before it.

## Topics

- [database.md](database.md): models, relations, lifecycle, retained state, and schema comments.
- [dtos.md](dtos.md): public request and response types under `packages/api/src/structures/`.
- [controllers.md](controllers.md): operation shape, routes, actor guards, and published JSDoc.
- [providers.md](providers.md): authorization, queries, writes, transformers, collectors, and transactions.
- [testing.md](testing.md): end-to-end scenarios and behavioral proof.
- [typescript.md](typescript.md): recurring TypeScript, typia, and Prisma diagnostics.
- [debugging.md](debugging.md): assigning a failure to its owning layer.

## Layer Ownership

| Layer | Owns |
| --- | --- |
| Schema | Stored facts, relations, constraints, and lifecycle representation |
| DTO | Public request and response shapes |
| Controller | Route, actor guard, parameters, response, and published contract |
| Provider | Business rules, visibility, database access, and transactions |
| Test | Observable proof through public operations |

Fix a defect at its owner. A provider must not compensate for a missing column, a controller must not contain business logic, and a test must not weaken a legitimate requirement.

## API Package Entry

Keep this shape in `packages/api/package.json`:

```json
{
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "main": "./lib/index.js",
    "types": "./lib/index.d.ts",
    "exports": {
      ".": {
        "types": "./lib/index.d.ts",
        "default": "./lib/index.js"
      }
    }
  }
}
```

`main` and `exports` point every workspace package to the current TypeScript source. `publishConfig` switches the same package root to compiled JavaScript and declarations when the package is packed or published.

If `main` or `exports` points to `lib`, local packages can read a missing or stale build. For this reason, never change `main`, `exports`, or `publishConfig`.

## Implementation Order

1. Read every requirement under `docs/analysis/`.
2. Design the complete schema under `prisma/schema/`.
3. Run `pnpm build:prisma` and `pnpm schema`.
4. Declare every DTO under `../api/src/structures/` and every operation under `src/controllers/` as a complete contract with a temporary typed stub body.
5. Run `pnpm build:sdk` once after the entire DTO and controller contract settles.
6. Write tests under `test/features/` from the requirements and generated SDK.
7. Implement providers, transformers, collectors, and authorization until the runtime suite passes.

The temporary controller stub declares the real route, signature, JSDoc, and response type. Its body mentions each parameter and returns `typia.random<T>()`, allowing SDK generation before provider logic exists. Remove every stub marker when replacing the body with one provider call.

## Compiler Checking

The backend compiler process is:

```bash
pnpm check:watch
```

The package compiles as two Programs. `tsconfig.json` covers `src/`, and `test/tsconfig.json` covers the tests together with that source; the watcher runs the test Program, so it sees both. Authored API DTOs belong to the API package and are checked by its own build. The watcher automatically reloads its lint configuration and reports type, lint, and contributor diagnostics. Your current objective owns when the watcher starts and stops; follow it exactly rather than a lifecycle you infer from elsewhere. A compiler check is clean only after the latest change rebuilds without a diagnostic.

The provided `tsconfig.json` and lint configuration files are frozen, in the package and in `test/` alike. Do not add, delete, or edit one, and do not change rule configuration by phase except an edit the active arm's skill explicitly prescribes.

## Environment And Runtime

Create the local environment from the example before tests or server startup:

```bash
cp .env.example .env
```

The database is disposable SQLite. `pnpm schema` force-resets it. Do not add deployment abstractions or a server database.

The backend server starts with:

```bash
pnpm dev
```

Start it before live frontend integration and keep it running through Overall Final.

## Generation Boundaries

| Authored change | Action |
| --- | --- |
| Schema model, field, relation, or comment | Settle the schema, then `pnpm build:prisma` and `pnpm schema` |
| Complete DTO and controller contract | Settle the complete contract, then `pnpm build:sdk` once |
| Provider or test only | Do not regenerate |
| Complete backend change | Require a clean watcher rebuild under the lifecycle your objective prescribes |

Run mutating generators and runtime tests one at a time. Do not start a second backend watcher.

## Backend Gate

The backend gate requires:

1. the active arm's backend review;
2. a clean current `check:watch` rebuild;
3. settled Prisma and SDK generation; and
4. `pnpm test` succeeding against the current implementation.

`pnpm test` reports only the tests that exist. It cannot report an operation nobody tested, which is what Operation Ownership in `testing.md` and the active arm's review are for.

Do not use the backend aggregate `pnpm build` or workspace-root build as a substitute. They obscure the failing layer and the root build also compiles the unfinished frontend.
