# AGENTS.md — `@systemfsoftware/stryker-js-html-parser`

One substrate, one package: the `html` Parser plugin for the mutation engine, on the effect-free ABI. The parent `packages/stryker-js/AGENTS.md` governs.

## Rules

- **HP1** — This package declares exactly one contribution, `declarePlugin('Parser', 'html', makeHtmlParser)`, and claims only `.html`; no other format lives here. Gate: `review`.
- **HP2** — The published surface stays effect-free: no `effect` import in `src/`. Gate: `grep -rn "from 'effect" src/` returns no hits.
- **HP3** — `parseHtml` reports a failure as the returned `ParseFailed` value; it never throws across the factory boundary. Gate: `pnpm --filter @systemfsoftware/stryker-js-html-parser test`.
- **HP4** — `angular-html-parser` is the only format dependency and stays a regular `dependencies` entry, never a peer. Gate: `review`.
- **HP5** — Behaviour tests are one Gherkin feature in `tests/*.integration.test.ts` driving the published entry; no test file lives under `src/`. Gate: `pnpm --filter @systemfsoftware/stryker-js-html-parser lint`.

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-html-parser build
pnpm --filter @systemfsoftware/stryker-js-html-parser typecheck
pnpm --filter @systemfsoftware/stryker-js-html-parser test
pnpm --filter @systemfsoftware/stryker-js-html-parser lint
pnpm --filter @systemfsoftware/stryker-js-html-parser attw
```
