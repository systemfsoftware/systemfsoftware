# Vitest config: both condition pipelines, or the shared config

A `vitest.config.ts` (or `.mts`, or `vitest.contract.config.ts`) must set the
development source condition on **both** Vite condition pipelines — `resolve.conditions`
and `ssr.resolve.conditions` — or import the shared `@systemfsoftware/vitest-config`
module, which sets both.

Vite replaces its default conditions when they are set, and in Vitest 4 the
node-environment pipeline resolves through the SSR resolver, where
`resolve.conditions` alone is inert. A config that sets one key leaves half the
suites importing built `dist/`, so they pass against stale output and fail on a
clean checkout, and coverage keys come out as `dist/*.mjs` instead of `src/`.

Fix it by importing the shared config, or by setting both keys to the condition
and spreading the defaults back in rather than dropping them.

```grit
language js
multifile {
  file($name, $body) where {
    $name <: r".*/(?:vitest\.config\.(?:ts|mts)|vitest\.contract\.config\.ts)",
    $program <: not contains sharedVitestConfig(),
    $program <: not contains `ssr: { resolve: { conditions: [$cond, $...] } }` where {
      $cond <: condition()
    }
  }
}
```
