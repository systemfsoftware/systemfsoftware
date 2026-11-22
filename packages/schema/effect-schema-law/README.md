# @systemfsoftware/effect-schema-law

Property-test codec laws for [Effect](https://effect.website) `Schema`.

A schema's round trip starts from a Type value and is the default it is held to: `decode(encode(value))` is equivalent to `value`, and re-encoding is equivalent to the original encoded form. `ruleOfSchemas` asserts those laws as ordinary Vitest tests, drawing inputs from the schema itself through Effect's `Arbitrary` and driving the runs with fast-check:

- **Round-trip identity** — `decode(encode(x))` is equivalent to `x`.
- **Encode stability** — re-encoding the decoded value is equivalent to the original encoded form.

```ts
import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
import { Schema as S } from 'effect'

const Email = S.String.pipe(S.brand('Email'))

// inside a Vitest file — registers two property tests
ruleOfSchemas('Email', Email)
```

## One-way schemas

A schema may forbid a direction with `SchemaGetter.forbidden`, and Effect reports the restriction as a `Forbidden` schema issue. A value the codec refuses to encode has no round trip, so the law holds for that value instead of refuting it; a value that encodes must still round-trip, and any failure that is not a `Forbidden` issue refutes as before.

The laws recognise a one-way schema from what the codec returns, never from a name, suffix or annotation. At registration a fixed sample of Type-side values decides only how the Type-side laws are titled and which law for the surviving direction is registered:

- `∀x_<name>Enc_=x` and `∀x_<name>_=x` — no refusal was sampled; the schema is held to the round trip.
- `∀x_<name>Enc_→Forbidden|=x` and `∀x_<name>_→Forbidden|=x` — a refusal was sampled; the values it refuses have no round trip to state.
- `∀i_<name>Dec_→Deterministic` — added when an encode refusal was sampled. `i` is drawn from `Schema.toEncoded(schema)`; decoding it twice must yield the same outcome and equivalent values, and a decoded value must be one the encode law accepts.
- `∀x_<name>Enc_→Deterministic` — added when a decode refusal was sampled (an encode-only schema). Encoding `x` twice must yield the same outcome and equivalent encoded values.

A verdict never depends on the sample: a refusal drawn at run time holds under either title. The sample only decides what the laws are called and whether the surviving-direction law exists.

The generated laws do not prove that a one-way decode maps each input to the right value — a decoder that returns a constant passes them. That proof is an example, a property of its own, or an adapter's contract cases. Decode totality over the Encoded side is not required either: a decoder that refuses unwelcome input is a working codec.

## A law that evaluated nothing

A law never reports a pass for a relation no draw evaluated. When every draw held but no draw was an instance, the test ends **skipped** with the reason:

- a surviving-direction decode law whose Encoded side the generator cannot draw decodable values from — declare the wire format on the Encoded side so the generator can draw it, or write the transformation over the parsed value; until then only examples or contract cases exercise the decoder;
- a Type-side law titled `=x` on which no value completed a round trip, or an encode-determinism law on which no value encoded.

A law under a `→Forbidden|=x` title has an instance on every draw, because the refusal is part of what it states. A refutation is raised before the skip is decided, so a skip never hides a failure.

## Recursive schemas

`recursionLaws(label, schema)` adds the generation laws a recursive union needs, and registers nothing at all for a schema whose syntax tree carries no recursion cycle. Pass the schema that _is_ the recursion point — the `Schema.suspend` that returns the union, or the union itself:

- **Nesting inside the declared ceiling** — every generated value stays within the budget the schema declares (a schema that declares none is held to the fixed per-suspension ceiling).
- **Deep values stay reachable** — a sample of generated values keeps a floor of deeply nested values. Registered only when the declaration asks for more depth than the stock derivation reaches, so it is never a claim that cannot be made.
- **Every member stays inhabited** — each member of the cycle is reachable from generation.

```ts
import { recursionLaws } from '@systemfsoftware/effect-schema-law'

// beside ruleOfSchemas — registers two more property tests for a recursive union
recursionLaws('Expr', Expr)
```

A `recursionBudget` annotation that nothing materialized — the plugin that builds the derivation hook is missing from the test run — fails the suite by name rather than quietly generating stock values.

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-law
```

Install as a **devDependency** — the entry registers tests. `effect` and `vitest` are peer dependencies: you bring your own, so the helper shares your single test-runner instance. `vitest` is marked optional only so installing the package outside a test toolchain does not warn; registering laws needs it. `fast-check` is a regular dependency and installs with the package. No other test runner is required.

A failing law reports the drawn counterexample, shrunk by fast-check, and the seed fast-check prints for replaying the run. A draw the schema's `Arbitrary` cannot produce, or an Effect verdict that fails, is reported as its own failure, never as a refutation.

Call `ruleOfSchemas(name, schema)` at the top level of a Vitest test file, or inside an `if (import.meta.vitest !== void 0)` block in the module that declares the schema — a bundler that defines `import.meta.vitest` as `undefined` compiles that branch away, so nothing reaches your published output.
