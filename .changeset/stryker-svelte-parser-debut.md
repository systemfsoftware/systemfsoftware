---
"@systemfsoftware/stryker-js-svelte-parser": minor
---

New package: adds `.svelte` mutation support. It parses a component with the Svelte compiler from your own project — this package declares no dependency on Svelte and installs none — and hands the component's scripts and template expressions to the instrumenter.

To use it, add `@systemfsoftware/stryker-js-svelte-parser` to `plugins` and include `.svelte` files in `mutate`. Mutating a `.svelte` file in a project where Svelte is not installed fails with a configuration error naming the missing compiler.
