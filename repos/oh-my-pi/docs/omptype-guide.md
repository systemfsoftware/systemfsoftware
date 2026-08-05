# omptype Guide (schema authoring in this repo)

Internal schemas use **`@oh-my-pi/omptype`** — an ArkType-compatible validator
with a lazy JIT runtime (`packages/omptype`). Author types with
`import { type } from "@oh-my-pi/omptype"`.

> **Scope rule.** Zod stays supported at the **external boundary** — `Tool.parameters`
> accepts Zod _or_ omptype _or_ JSON Schema, and the public `pi.zod` extension API is
> untouched. Internal schemas use omptype.

## Why omptype (perf contract)

- `type()` construction is ~100x cheaper than arktype (no eager codegen, no node interning).
- The first two calls run an interpreter; the third call JIT-compiles a specialized
  validator via `new Function`. Hot-path validation is tens of nanoseconds; failures
  allocate one small error object with lazy message building.
- There is no `jitless` switch and no `scope()` — lazy JIT removed the startup tax
  those existed to dodge. Import `type` directly.

## The detection contract (don't break it)

`packages/ai/src/utils/schema/wire.ts` distinguishes the three schema kinds:

- **omptype** = a _callable function_ with `.toJsonSchema` and `.assert` methods (`isArkSchema`).
- **Zod** = a non-callable object carrying `_zod` + `.parse` (`isZodSchema`).
- **JSON Schema** = a plain object.

At the provider boundary, `toolWireSchema()` calls `toJsonSchema()`, prunes
`T | undefined` branches, and closes declared objects with
`additionalProperties: false`. Predicates (`.narrow`) and morphs (`.pipe`)
validate locally but degrade to their base schema on the wire.

## Definition language (arktype-compatible subset)

| Construct                  | Form                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| Primitives                 | `"string"`, `"number"`, `"boolean"`, `"null"`, `"undefined"`, `"unknown"`, `"object"`, `"bigint"` |
| Integer                    | `"number.integer"`                                                |
| URL string                 | `"string.url"`                                                    |
| Literals                   | `"'x'"`, `"5"`, `"true"`                                          |
| Unions                     | `"'a' \| 'b'"`, `"string \| null"`                                |
| Arrays                     | `"string[]"`, `"(string \| number)[]"`, `[def, "[]"]`             |
| Bounds                     | `"number >= 0"`, `"0 < number <= 3600"`, `"1 <= string <= 10"`    |
| Optional key               | `{ "limit?": "number" }` or value-suffix `{ limit: "number?" }`   |
| Defaults                   | `{ count: "number = 10" }`, `type("string[]").default(() => [])`  |
| Undeclared keys            | `"+": "reject"` (fail) / `"+": "delete"` (strip) / default keep   |
| Records                    | `{ "[string]": "number" }` — NOT `"Record<string, number>"`       |
| Runtime enums              | `type.enumerated(...RUNTIME_ARRAY)`                               |
| Runtime-built object defs  | `type.raw({...})` (returns `BaseType`)                            |
| Keyword statics            | `type.number.atLeast(5).atMost(300)`, `type.string`               |

## Validating (same as arktype)

```ts
import { type } from "@oh-my-pi/omptype";
const out = schema(value);
if (out instanceof type.errors) {
  // out.summary → human message; entries have .path (array) and .problem
  throw new Error(out.summary);
}
// `out` is the validated/morphed value (defaults filled, extras stripped)
```

- Failure returns an `OmpErrors` (array of `OmpError`); `type.errors === OmpErrors`.
- Validation is fast-fail: one error entry per failure.
- Morphs never mutate the input; when defaults/`"+": "delete"`/pipes apply, a fresh
  object is returned.
- NEVER use `.allows()` for tool validation — it skips morphs/defaults/pipes.
- `.infer` / `.inferIn` are inference-only properties.
- Definition mistakes (bad DSL, illegal composition) throw `OmpTypeError` at
  `type()` time.

## Methods

`.describe(d)`, `.default(v | () => v)`, `.or(TypeOrStringDef)`, `.and(Type)`,
`.array()`, `.atLeastLength(n)` / `.atMostLength(n)` (string/array),
`.atLeast(n)` / `.atMost(n)` (number), `.pipe(fn)`, `.narrow(fn)` (with
`ctx.mustBe("...")`), `.allows(v)`, `.assert(v)`, `.toJsonSchema()`.

Note on `.or()` typing: schema and string operands infer precisely;
object-literal operands degrade — wrap them with `type({...})` first.

## Zod → omptype translation (for new code)

| Zod                                | omptype                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| `z.object({ a: ... })`             | `type({ a: ... })`                                          |
| `z.enum(["a","b"])` (static)       | `"'a' \| 'b'"`                                              |
| `z.enum(RUNTIME_ARRAY)`            | `type.enumerated(...RUNTIME_ARRAY)`                         |
| `z.record(z.string(), z.number())` | `type({ "[string]": "number" })`                            |
| `.optional()`                      | optional key `{ "a?": "string" }`                           |
| `.strict()` / `.strip()`           | `"+": "reject"` / `"+": "delete"`                           |
| `.refine(fn, msg)`                 | `.narrow((d, ctx) => fn(d) \|\| ctx.mustBe("<expect>"))`    |
| `.transform(fn)`                   | `.pipe(fn)`                                                 |
| `.catch(fallback)`                 | `type("unknown").pipe(raw => { const out = inner(raw); return out instanceof type.errors ? FALLBACK : out; })` |
| `z.infer<typeof S>`                | `typeof S.infer`                                            |

## Adapters

For TypeBox-style or Zod-style authoring backed by the omptype runtime:

```ts
import { Type, type Static } from "@oh-my-pi/omptype/typebox";
import { z } from "@oh-my-pi/omptype/zod";
```

Both produce real omptype schemas (JIT validation, `toJsonSchema`, wire
detection). Use them for extension-facing surfaces; internal code authors
the string DSL directly.
