# @systemfsoftware/effect-playwright

Effect-based Playwright integration — forked under systemfsoftware from [Jobflow-io/effect-playwright](https://github.com/Jobflow-io/effect-playwright) and rebuilt on this repo's conventions (Effect v4, oxlint `all`, gherkin integration specs).

## Install

```bash
pnpm add @systemfsoftware/effect-playwright
pnpm @systemfsoftware/effect-playwright install chromium
```

Browser installation is not required when connecting to an existing browser via CDP or a local browser.

## Quick start

```ts
import { chromium, Playwright } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  const playwright = yield* Playwright.Playwright

  // The browser is closed automatically when the scope ends.
  const browser = yield* playwright.launchScoped(chromium, { headless: true })
  const page = yield* browser.newPage()

  yield* page.setContent('testing')
}).pipe(Effect.scoped, Effect.provide(Playwright.layer))

await Effect.runPromise(program)
```

## Surface

- `Playwright` — services and constructors: `Playwright`, `Browser`, `BrowserContext`, `Page`, `Frame`, `Locator`, `FrameLocator`, `Keyboard`, `Mouse`, `Touchscreen`, `Clock`, `Tracing`, `Screencast`, `WebStorage`, `Credentials`, request/response/worker/dialog wrappers, `PlaywrightError`.
- `PlaywrightSpawner` — `layer(engine, options)` + `withBrowser` scoped provisioning.
- `@systemfsoftware/effect-playwright/test` — `@playwright/test` integration for Effect programs (`test.effect`, shared-layer `layer(...)` blocks).
- `@systemfsoftware/effect-playwright/experimental` — `BrowserUtils` (page/frame traversal, frame-navigation streams).
- `bin` — `effect-playwright` CLI forwarding to `playwright-core` (install/codegen/show-trace).

All fallible operations fail with `Playwright.PlaywrightError` (`reason: 'Timeout' | 'Unknown'`). Playwright does not support interruption — prefer Playwright's own `timeout` options over `Effect.timeout`.

## Development

```bash
pnpm --filter @systemfsoftware/effect-playwright build   # tsdown → dist/
pnpm --filter @systemfsoftware/effect-playwright test    # vitest (gherkin integration specs; needs a chromium binary)
pnpm --filter @systemfsoftware/effect-playwright test:playwright # @playwright/test runner e2e for ./test
```

## License

Apache-2.0
