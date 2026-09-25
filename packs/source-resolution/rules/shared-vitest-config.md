# Shared Vitest config: both Vite condition pipelines, named

The shared Vitest config module must name the development source condition and
set it on both pipelines, `resolve.conditions` and `ssr.resolve.conditions` — a
config that spreads this object inherits whatever it wires, so every package
that imports it is only as correct as this file.

If the module omits the condition, or sets one key and not the other, every
package spreading it resolves published names to `dist/` through the pipeline
that key does not cover: tests pass against stale output, fail on a clean
checkout, and coverage keys list `dist/` instead of `src/`.

Fix it by naming the condition on both keys — spreading Vite's
`defaultClientConditions` and `defaultServerConditions` back in, because Vite
replaces its defaults when they are set.

```grit
language js
multifile {
  file($name, $body) where {
    $name <: r".*/vitest-config/lib/base\.js",
    $name <: sharedVitestConfigFile(),
    $program <: or {
      not contains condition(),
      not contains `resolve: { conditions: $_ }`,
      not contains `ssr: { resolve: { conditions: $_ } }`
    }
  }
}
```
