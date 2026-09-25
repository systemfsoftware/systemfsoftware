# @systemfsoftware/effect-playwright

Run Playwright from Effect programs. You keep Playwright's own objects and types; this package adds what Playwright does not give an Effect program: lazy calls with typed errors, lifetimes bound to a `Scope`, event streams that end with their source, page callbacks that run Effects, and a Playwright Test entry for Effect test bodies.

## Install

```sh
pnpm add @systemfsoftware/effect-playwright 'effect@4.0.0-rc.117'
pnpm effect-playwright install chromium
```

`effect-playwright` forwards to the bundled `playwright-core` CLI, so it installs the browser build that matches it. `@playwright/test` is an optional peer, needed only for the `./test` entry.

## Calling Playwright

```ts
import { acquire, attempt, chromium } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  const browser = yield* acquire(() => chromium.launch())
  const page = yield* acquire(() => browser.newPage())
  yield* attempt(() => page.goto('https://example.com'))
  return yield* attempt(() => page.title())
}).pipe(Effect.scoped)
```

- `attempt(() => call)` runs the call when the effect runs. A timeout fails with `PlaywrightTimeout`; any other rejection fails with `PlaywrightFailure`. Both carry the Playwright error as `cause`.
- `acquire(() => open)` opens anything Playwright can dispose (a browser, context, page, or the `Disposable` from `route`, `addInitScript`, `exposeBinding`) and disposes it when the scope closes, innermost first.

Playwright calls cannot be interrupted, so `Effect.timeout` stops waiting without stopping the call. Use Playwright's `timeout` option.

## Events

```ts
import { pageEvents } from '@systemfsoftware/effect-playwright'
import { Stream } from 'effect'

const messages = pageEvents(page, 'console').pipe(Stream.map((message) => message.text()))
```

`pageEvents`, `browserContextEvents`, and `browserEvents` end when the page or context closes or the browser disconnects, and end at once if it already had.

## Page callbacks

```ts
import { expose } from '@systemfsoftware/effect-playwright'

yield* expose(page, { name: 'save', run: (name: string) => Database.insert(name) })
```

Page code calls `window.save(...)` and receives the Effect's value; a failing Effect rejects the call. The Effect runs with the services of the program that exposed it, and the function is removed when that program's scope closes. `expose` also accepts a `BrowserContext`, which reaches every page in it.

## Services

`Browser`, `BrowserContext`, and `Page` are services holding the Playwright objects. `Browser.layer(() => chromium.launch())` provides one browser for the layer's lifetime.

## Playwright Test

```ts
import { attempt, Page } from '@systemfsoftware/effect-playwright'
import { expect, test } from '@systemfsoftware/effect-playwright/test'
import { Effect } from 'effect'

test.effect('shows the example.com headline', () =>
  Effect.gen(function*() {
    const page = yield* Effect.service(Page)
    yield* attempt(() => page.goto('https://example.com'))
    expect(yield* attempt(() => page.title())).toBe('Example Domain')
  }))
```

`test.effect` provides Playwright's `browser`, `context`, and `page` fixtures as the services above and runs the body in a scope released when the test ends. `layer(...)` acquires an Effect layer once for a block of tests; `makeMethods` adds `effect` and `layer` to a `test.extend(...)` result.

## API

[`etc/effect-playwright.api.md`](./etc/effect-playwright.api.md), [`etc/test.api.md`](./etc/test.api.md).

## License

Apache-2.0. The `./test` entry derives from [Jobflow-io/effect-playwright](https://github.com/Jobflow-io/effect-playwright) (MIT); see `NOTICE`.
