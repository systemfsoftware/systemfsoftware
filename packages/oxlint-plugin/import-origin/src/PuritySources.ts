export const IO_SOURCES: ReadonlySet<string> = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'http',
  'node:http',
  'https',
  'node:https',
  'http2',
  'node:http2',
  'process',
  'node:process',
  'console',
  'node:console',
  'timers',
  'timers/promises',
  'node:timers',
  'node:timers/promises',
  'child_process',
  'node:child_process',
  'net',
  'node:net',
  'tls',
  'node:tls',
  'dgram',
  'node:dgram',
  'dns',
  'dns/promises',
  'node:dns',
  'node:dns/promises',
  'readline',
  'readline/promises',
  'node:readline',
  'node:readline/promises',
  'tty',
  'node:tty',
  'worker_threads',
  'node:worker_threads',
  'cluster',
  'node:cluster',
  'effect/Effect',
  'effect/Layer',
  'effect/Service',
  'effect/Runtime',
])

/**
 * The pure `effect` facades: data and dispatch vocabularies that construct no
 * effect, layer or service value, and read no clock or randomness. Audited
 * against the vendored source at `repos/effect/packages/effect/src/` by two
 * independent checks - no import of the effect machinery modules (`Effect`,
 * `Layer`, `Scope`, `Fiber`, `Clock`, `Random`, `Runtime`, `Ref`, `Deferred`,
 * `Queue`, `PubSub`, `Schedule`, `Metric`, `Console`, `Logger`, `Tracer`,
 * `Config`), and no `Date.now`, `new Date()`, `performance.now` or
 * `Math.random` in the module body.
 *
 * The two checks disagreed on exactly one candidate and that is why both run:
 * `effect/DateTime` imports no machinery module yet calls `Date.now` directly,
 * so it is a clock and stays out. `effect/Duration` is a time *span* with
 * neither, and is in.
 *
 * This is an allowlist, and it is the one that survives the objection in the
 * note in `make-body-purity.config.ts`: it names a versioned third-party
 * surface audited once against vendored source, not local filenames any author
 * extends by typing a line. Without it the rule pushes an author to hand-roll
 * what the standard library already provides - a recursive `range` in place of
 * `Array.range` was written this way before `effect/Array` was sealed here.
 */
export const EFFECT_PURE_SUBPATHS: ReadonlySet<string> = new Set([
  'effect/Array',
  'effect/BigInt',
  'effect/Boolean',
  'effect/Cause',
  'effect/Chunk',
  'effect/Data',
  'effect/Duration',
  'effect/Equal',
  'effect/Exit',
  'effect/Filter',
  'effect/Function',
  'effect/Hash',
  'effect/HashMap',
  'effect/HashSet',
  'effect/Iterable',
  'effect/Match',
  'effect/Number',
  'effect/Option',
  'effect/Order',
  'effect/Ordering',
  'effect/Pipeable',
  'effect/PlatformError',
  'effect/Predicate',
  'effect/Record',
  'effect/Result',
  'effect/Schema',
  'effect/String',
  'effect/Struct',
  'effect/Tuple',
])

export const EFFECT_ROOT_IO_NAMES: ReadonlySet<string> = new Set([
  'Effect',
  'Layer',
  'Service',
  'Runtime',
  'Scope',
  'Ref',
  'Deferred',
  'Queue',
  'PubSub',
  'SynchronizedRef',
  'SubscriptionRef',
  'Semaphore',
  'Pool',
  'Fiber',
  'FiberHandle',
  'FiberSet',
  'Schedule',
  'Metric',
  'Supervisor',
  'Clock',
  'Random',
  'Console',
  'Config',
  'ConfigProvider',
  'Logger',
  'Tracer',
  'CurrentTracer',
])

/**
 * The `effect` root exports that are the same audited-pure vocabularies reachable
 * as subpaths above, plus the point-free combinators. A root binding is
 * classified by name because one specifier carries them all.
 */
export const EFFECT_ROOT_PURE_NAMES: ReadonlySet<string> = new Set([
  'Array',
  'BigInt',
  'Boolean',
  'Cause',
  'Chunk',
  'Data',
  'Duration',
  'Either',
  'Equal',
  'Exit',
  'Filter',
  'Function',
  'Hash',
  'HashMap',
  'HashSet',
  'Iterable',
  'Match',
  'Number',
  'Option',
  'Order',
  'Ordering',
  'Pipeable',
  'PlatformError',
  'Predicate',
  'Record',
  'Result',
  'Schema',
  'String',
  'Struct',
  'Tuple',
  'flow',
  'identity',
  'pipe',
])
