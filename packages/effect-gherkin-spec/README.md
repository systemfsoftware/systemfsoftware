# @systemfsoftware/effect-gherkin-spec

Write Gherkin-style behaviour tests with [Effect](https://effect.website).

`feature` / `scenario` / `it` gives you a lightweight DSL for organising integration tests. Each scenario runs as an `Effect`, assertions are captured inline, and everything plugs into `@effect/vitest` so failures come out as normal Vitest output.

```ts
import { feature, it } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as assert from 'node:assert'

const loginFeature = feature('Login')

loginFeature.scenario('logs in with valid credentials', () =>
  Effect.gen(function*() {
    const user = yield* authenticate('alice@example.com', 'hunter2')
    yield* it('returns a session token', user.token).expect(token => assert.ok(token.startsWith('sess_')))
  }))
```

Scenario outlines let you parameterise the same test across multiple inputs:

```ts
const math = feature('Math')

math.outline(
  'adding {a} and {b}',
  ({ a, b }: { a: number; b: number }) =>
    Effect.gen(function*() {
      const result = a + b
      yield* it('produces the sum', result).expect(r => assert.strictEqual(r, a + b))
    }),
  [
    { a: 1, b: 2 },
    { a: 0, b: 0 },
    { a: -1, b: 1 },
  ],
)
```

## Install

```bash
pnpm add -D @systemfsoftware/effect-gherkin-spec
```

> [!NOTE]
> `effect`, `@effect/vitest`, and `vitest` are peer dependencies — you bring your own.
