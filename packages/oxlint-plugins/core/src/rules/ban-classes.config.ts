/**
 * Shared constants for the `ban-classes` rule.
 *
 * The sanctioned set is the ONLY policy knob of the rule — editing this set is
 * the single reconciliation point. Every entry was verified against the
 * vendored Effect v4 source (`repos/effect/packages/effect/src/...`) rather
 * than asserted from documentation:
 *
 * - `Context.Service`       -> Context.ts:201 (double-call: `Service<Self>()('Tag')`)
 * - `Context.Reference`     -> Context.ts:1324 (single-call: `Reference<Shape>('key', { defaultValue })`)
 * - `Schema.Class`          -> Schema.ts:14307
 * - `Schema.Error`          -> Schema.ts:14427
 * - `Schema.TaggedError`    -> Schema.ts:14488
 * - `Schema.TaggedClass`    -> Schema.ts:14367
 * - `Schema.Opaque`         -> Schema.ts:6462
 * - `Data.Class`            -> Data.ts:48
 * - `Data.Error`            -> Data.ts:712
 * - `Data.TaggedClass`      -> Data.ts (tagged class factory)
 * - `Request.Class`         -> Request.ts:370
 * - `Request.TaggedClass`   -> Request.ts:409
 * - `Pipeable.Class`        -> Pipeable.ts:625
 * - `Inspectable.Class`     -> Inspectable.ts (extends usage across `src/`)
 * - `Effectable.Class`      -> Effectable.ts:66
 * - `Persistable.Class`     -> unstable/persistence/Persistable.ts:142
 * - `Rpc.make`              -> unstable/rpc/Rpc.ts:902
 * - `RpcMiddleware.Service` -> unstable/rpc/RpcMiddleware.ts (class factory)
 * - `RpcGroup.make`         -> unstable/rpc/RpcGroup.ts (used in `extends`, e.g. McpSchema.ts)
 *
 * Deliberately NOT in the set:
 * - `Data.TaggedError` — v3-era idiom already owned by the sibling
 *   `ban-data-taggederror` rule; see `SIBLING_RULE_TERRITORY`.
 * - `Schema.Union` — returns a schema value, not a constructor; a class
 *   extending it is not a sanctioned idiom.
 * - `Context.ServiceClass` — an interface (Context.ts:123), type-only, not a
 *   runtime value that can be extended.
 */
export const SANCTIONED_MODULE = 'effect' as const

export const SANCTIONED_BASES: ReadonlySet<string> = new Set([
  'effect/Context.Service',
  'effect/Context.Reference',
  'effect/Schema.Class',
  'effect/Schema.Error',
  'effect/Schema.TaggedError',
  'effect/Schema.TaggedClass',
  'effect/Schema.Opaque',
  'effect/Data.Class',
  'effect/Data.Error',
  'effect/Data.TaggedClass',
  'effect/Request.Class',
  'effect/Request.TaggedClass',
  'effect/Pipeable.Class',
  'effect/Inspectable.Class',
  'effect/Effectable.Class',
  'effect/Persistable.Class',
  'effect/Rpc.make',
  'effect/RpcMiddleware.Service',
  'effect/RpcGroup.make',
])

/**
 * Bases another rule in this plugin family already bans. `ban-data-taggederror`
 * owns the v3 `Data.TaggedError` idiom; this rule stays silent on it so the two
 * rules never double-report the same class.
 */
export const SIBLING_RULE_TERRITORY: ReadonlySet<string> = new Set([
  'effect/Data.TaggedError',
])

/**
 * The whole point of the rule is that the judge is the extends-expression's
 * AST shape, never the class's name — so there is deliberately NO name
 * whitelist option (`schema: []`).
 */
export const ANONYMOUS_CLASS = '<anonymous>' as const

/**
 * Test and fixture paths are out of scope: a class that only exists to exercise
 * production code is not authoring drift in the product surface. Mirrors the
 * in-rule boundary `no-date-now-in-effect` and `no-either-tag-assertions`
 * already draw.
 */
export const TEST_OR_FIXTURE_PATH = /(^|\/)(__tests__|__fixtures__|tests|testResources)\/|\.(test|spec)\.[cm]?[jt]sx?$/

export const EXPECTED =
  `a class extending a sanctioned Effect v4 constructor (capability: Context.Service / Context.Reference; data model: Schema.Class / Schema.Opaque / Data.Class / Data.TaggedClass / Request.Class / Request.TaggedClass; error model: Schema.Error / Schema.TaggedError / Schema.TaggedClass / Data.Error; rpc: Rpc.make / RpcMiddleware.Service / RpcGroup.make; base class: Pipeable.Class / Inspectable.Class / Effectable.Class / Persistable.Class) or no class at all` as const

export const FIX =
  "delete the class when it defends nothing the rest of the code depends on; otherwise replace it with a function returning an Effect — for a capability use Context.Service<Self>('Tag'), for a data model Schema.Class<Self>()('Name')({ ... }), for an error model Schema.TaggedError<Self>()('Tag', { ... })" as const

export const MESSAGE_BANNED = "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}."

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Ban classes except where Effect v4 makes a class the sanctioned idiom (Context.Service, Schema.Class, Data.TaggedClass, Rpc factories, ...)',
  },
  schema: [],
  messages: {
    banned: MESSAGE_BANNED,
  },
} as const
