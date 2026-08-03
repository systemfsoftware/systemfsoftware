# @systemfsoftware/oxlint-plugin-effect-adapter

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-adapter?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-adapter)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-adapter?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want adapter files that stay a pure translation seam.

```
x @systemfsoftware/effect-adapter(adapter-single-external-system): sendgrid is forbidden.
  Expected: exactly one external system per *.adapter.ts file — this file already wraps stripe.
  Actual: imports of stripe and @sendgrid/mail.
  Fix: split each technology into its own *.adapter.ts file, each implementing its own port.

x @systemfsoftware/effect-adapter(adapter-no-cast): as is forbidden.
  Expected: S.decodeUnknown at the foreign boundary — the decode is the only way a driver payload enters the port.
  Actual: an as type assertion on foreign driver data.
  Fix: replace the cast with S.decodeUnknown(Shape)(raw) and map decode failures to the port's typed error.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-adapter
```

## The Problem

A `*.adapter.ts` is meant to wrap one external system — Schema-decode its payloads, never cast them, absorb driver errors, map only consumer-actionable ones to typed E. A second SDK import, an `as User` cast, an import of a sibling workflow, or a missing `Layer` export all still compile, still pass a standard lint config, and still pass their tests. They are only wrong relative to a convention no tool knows about, and they surface months later as a boundary that cannot be tested without the real vendor.

These four rules make that convention executable. Every rule is inert on any file not named `*.adapter.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectAdapter from '@systemfsoftware/oxlint-plugin-effect-adapter'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-adapter'],
  rules: { ...effectAdapter.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-adapter/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                             | Reports                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter-single-external-system` | A second distinct foreign package import — two technologies in one file. `effect/*`, `node:*`, and relative imports are not foreign systems; subpath imports of the same package (`stripe/checkout`) are fine                                   |
| `adapter-no-cast`                | Any `as` type assertion or angle-bracket `<T>` assertion. The single exemption is `as const`, which narrows a literal and asserts nothing about untrusted data                                                                                  |
| `adapter-no-domain-cell-imports` | An import of a sibling domain cell (`.workflow`, `.state`, `.kernel`, `.handler`, `.policy`, `.store`, `.acl`, `.observer`, `.adapter`, `.middleware`). The port (executor), domain error (schema), and foreign shape (shape) remain importable |
| `adapter-layer-required`         | An adapter with no exported `Layer` construction — the composition root wires `Layer.effect(Port, make)` (live) or `Layer.succeed(Port, impl)` (default/declined/stub), so without it the port has no implementation to select                  |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-adapter'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.adapter.ts` files are examined.

**Q: Diagnostics say `@systemfsoftware/effect-adapter(...)`, but my config key is the full package name.**
A: Expected — oxlint shortens the namespace when printing. Both spellings work as config keys.

**Q: Why is a `const StripeLive = Layer.effect(...)` without an `export` reported?**
A: The composition root selects the port's implementation by importing the Layer. A private Layer construction can never be wired — `adapter-layer-required` is the obligation that keeps the deliverable visible.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-adapter/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
