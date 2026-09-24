---
"@systemfsoftware/vitest": minor
---

Tests take `expect` from the test callback and yield each check: `it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) })`. The package stops exporting `expect`, `assert` and the `utils` helpers. With its `guard` entry listed in `setupFiles`, an `expect` imported from Vitest, or a test registered through Vitest's own `it`, is refused. Also refused, each with its rewrite as the message: a second check on one observed state, an unyielded check, a body with no check, a non-generator body, `it.effect`/`it.scoped`/`it.scopedLive`, `beforeEach`/`afterEach`, and weak matchers such as `toHaveLength`, `toBeDefined`, snapshots, `expect.anything`, `expect.soft`/`expect.poll` and argument-less `toThrow`. Libraries that judge inside a test import `step`, `captureRunBinding` and the `Check`/`Expect`/`Asserted` types from the `integration` entry.
