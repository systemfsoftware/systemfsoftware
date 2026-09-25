# @systemfsoftware/effect-playwright

An Effect-native Playwright driver. This library provides a set of services and layers to interact with Playwright in a type-safe way using Effect, plus an integration entry for the [Playwright Test](README.md#playwright-test-integration) runner.

Forked from [Jobflow-io/effect-playwright](https://github.com/Jobflow-io/effect-playwright) at `fd314a2` (0.8.0-2).

## Install

```sh
pnpm add @systemfsoftware/effect-playwright 'effect@4.0.0-rc.117'
pnpm effect-playwright install chromium
```

`@playwright/test` is an optional peer dependency: install it only to use the `./test` entry. Browser installation is not required if connecting to an existing browser via CDP or using a local browser.

## Entry points

- `@systemfsoftware/effect-playwright`
- `@systemfsoftware/effect-playwright/experimental`
- `@systemfsoftware/effect-playwright/test`

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

## Error handling

Every method returns an effect that can fail with `Playwright.PlaywrightError`, wrapping the original Playwright error with `reason` `"Timeout"` for a `TimeoutError` and `"Unknown"` otherwise. Playwright does not support interruption, so `Effect.timeout` does not behave like you might expect — use Playwright's own `timeout` option.

## CLI wrapper

`effect-playwright` forwards every command to the underlying `playwright-core` CLI:

```sh
pnpm effect-playwright install chromium
pnpm effect-playwright codegen https://example.com
pnpm effect-playwright show-trace trace.zip
```

## Playwright Test integration

```ts
import { Playwright } from '@systemfsoftware/effect-playwright'
import { expect, test } from '@systemfsoftware/effect-playwright/test'
import { Effect } from 'effect'

test.effect('shows the example.com headline', () =>
  Effect.gen(function*() {
    const page = yield* Playwright.Page
    yield* page.goto('https://example.com')

    const headline = page.getByRole('heading', { name: 'Example Domain' })
    expect(yield* headline.innerText()).toBe('Example Domain')
  }))
```

`test.effect` runs each Effect in a scope, so acquired resources are released when the test finishes, fails, or times out. Use `layer(...)` to acquire an Effect layer once per worker and share it across tests, and `makeMethods` to extend an existing Playwright `test` type with custom fixtures.

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-playwright.api.md`](./etc/effect-playwright.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-playwright#readme).
