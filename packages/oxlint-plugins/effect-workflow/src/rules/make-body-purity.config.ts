import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The module sources whose bindings are I/O by construction - performing
 * them reaches the process boundary. The named Node builtins (bare and
 * `node:`-prefixed) are the OS boundary; the effect-carrier subpaths export
 * the Effect/Layer/Service/Runtime values the plan's KTD3 bar names.
 * Everything else in this file is the audited complement: sources the spike
 * read module-by-module and sealed as pure.
 */
export const IO_SOURCES: ReadonlySet<string> = new Set([
  // node builtins - the plan's named set plus their immediate siblings.
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
  // the effect-carrier subpaths
  'effect/Effect',
  'effect/Layer',
  'effect/Service',
  'effect/Runtime',
])

/**
 * The pure effect facades, read in the spike: `effect/Match`, `effect/Result`,
 * `effect/Schema` and `effect/Exit` are data/dispatch vocabularies with no
 * effect, layer or service values (`repos/effect/packages/effect/src/`).
 * A binding from `effect`'s root is classified by name against
 * `EFFECT_ROOT_IO_NAMES` / `EFFECT_ROOT_PURE_NAMES`; any other root name is
 * an honest unknown until audited.
 */
export const EFFECT_PURE_SUBPATHS: ReadonlySet<string> = new Set([
  'effect/Match',
  'effect/Result',
  'effect/Schema',
  'effect/Exit',
])

/** The `effect` root exports that ARE the Effect/Layer/Service values. */
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

/** The `effect` root exports read as pure data/dispatch vocabularies in the spike. */
export const EFFECT_ROOT_PURE_NAMES: ReadonlySet<string> = new Set([
  'Result',
  'Match',
  'Option',
  'Either',
  'Exit',
  'Cause',
  'pipe',
  'flow',
  'identity',
])

/**
 * The local decision-source modules sealed by the spike's read: the three
 * production kernels (`RestartDecision.ts`, `Survivors.ts`, `HookVerdict.ts`),
 * the decode-only `HookOutput.ts`, the schema declaration modules
 * (`HookDispatcher.schema.ts`, `RestartDecision.schema.ts`) and the two
 * workflow modules consumers re-wrap (`Survivors.workflow.ts`,
 * `HookVerdict.workflow.ts`). Each is keyed by the source string exactly as
 * the importing make site spells it; an import the audit has not sealed is a
 * finding, never a silent pass.
 */
export const LOCAL_PURE_SOURCES: ReadonlySet<string> = new Set([
  './RestartDecision.js',
  './Survivors.js',
  './HookVerdict.js',
  './HookOutput.js',
  './HookDispatcher.schema.js',
  './RestartDecision.schema.js',
  './Survivors.workflow.js',
  '../HookVerdict.workflow.js',
])

/** The global names whose invocation performs I/O (KTD3's named globals). */
export const IO_GLOBAL_NAMES: ReadonlySet<string> = new Set([
  'console',
  'process',
  'Deno',
  'fetch',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'queueMicrotask',
  'require',
])

/** The global constants a decision may reference: language built-ins with no I/O. */
export const BENIGN_GLOBAL_NAMES: ReadonlySet<string> = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'Error',
])

export const PURE_BODY_EXPECTED =
  'a Workflow.make decision body whose references resolve to parameters, local const bindings, or imports of audited-pure modules' as const

export const IO_IMPORT_ACTUAL =
  'a reference to an I/O module carrying Effects/Layers/services or a Node I/O builtin' as const

export const IO_GLOBAL_ACTUAL =
  'a reference to an I/O global (console, process, Deno, timers, fetch) inside the decision' as const

export const MODULE_STATE_ACTUAL =
  'a reference to mutable module-level state (a let/var binding) — mutation is a second path and its read can race' as const

export const MUTABLE_LOCAL_ACTUAL = 'a reference to a mutable local binding (let/var) inside the decision' as const

export const UNRESOLVABLE_ACTUAL =
  'a reference the purity rule cannot classify: an import from a module the audit has not sealed, or an unresolved global' as const

export const IO_FIX =
  'hoist the I/O into the file that performs it and pass the result into the decision as data; delete the reference when nothing consumes it' as const

export const MODULE_STATE_FIX =
  'pass the module state in as a parameter and keep it out of the decision; delete the binding when nothing consumes it' as const

export const MUTABLE_LOCAL_FIX = 'declare it const, or delete it when nothing consumes it' as const

export const UNRESOLVABLE_FIX =
  'read the imported module, seal its classification in make-body-purity.config.ts, or move the reference out of the decision; delete it when nothing consumes it' as const

export const CONTROL_FLOW_BANNED_EXPECTED =
  'a single decision path: one expression of exhaustive dispatch, with at most one defensive guard as the first statement converging immediately' as const

export const CONTROL_FLOW_BANNED_ACTUAL =
  'a control-flow construct that opens a second path inside the decision' as const

export const CONTROL_FLOW_BANNED_FIX =
  'extract the branching into the kernel and dispatch over a closed type; delete the branch when it guards nothing' as const

export const UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED = 'a decision body the rules can locate in this file' as const

export const UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL =
  'a Workflow.make argument whose body is not visible from this file (imported, a non-function value, or an unresolvable reference)' as const

export const UNRESOLVABLE_MAKE_ARGUMENT_FIX =
  'move the decision body inline or into a module-scope function in this file so the one-path and purity obligations bind' as const

export const IO_IMPORT_REFERENCE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CONTROL_FLOW_BANNED_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

/** The node type a banned control-flow construct reports under, as the {{name}} slot. */
export const CONTROL_FLOW_KEYWORD_OF: Readonly<Record<string, string>> = {
  IfStatement: 'an if statement inside the decision body',
  ConditionalExpression: 'a ternary (? :) inside the decision body',
  LogicalExpression: 'a logical expression (&& or ||) inside the decision body',
  ForStatement: 'a for loop inside the decision body',
  ForInStatement: 'a for-in loop inside the decision body',
  ForOfStatement: 'a for-of loop inside the decision body',
  WhileStatement: 'a while loop inside the decision body',
  DoWhileStatement: 'a do-while loop inside the decision body',
  SwitchStatement: 'a switch statement inside the decision body',
} as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A Workflow.make decision body references only parameters, local const bindings, module declarations, and imports of audited-pure modules; I/O references, module state, local mutation, and unclassified references are refused, and control flow is limited to one converging first-statement guard.',
  },
  schema: [Options],
  messages: {
    ioImportReference: IO_IMPORT_REFERENCE_MESSAGE,
    ioGlobalReference: IO_IMPORT_REFERENCE_MESSAGE,
    moduleStateReference: IO_IMPORT_REFERENCE_MESSAGE,
    mutableLocalReference: IO_IMPORT_REFERENCE_MESSAGE,
    unresolvableReference: IO_IMPORT_REFERENCE_MESSAGE,
    controlFlowBanned: CONTROL_FLOW_BANNED_MESSAGE,
    unresolvableMakeArgument: CONTROL_FLOW_BANNED_MESSAGE,
  },
} as const
