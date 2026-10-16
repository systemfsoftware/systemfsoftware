import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * There is no allowlist of pure local modules, and the absence is deliberate.
 * One held eight hard-coded relative specifiers and granted a pass on the
 * strength of a filename its own author typed: adding a line certified a module
 * pure without reading it, renaming a file un-certified one whose contents had
 * not changed, and a bare relative specifier like `./Survivors.js` certified
 * that name in any package in any directory. Nothing recomputed purity, so
 * precision was total against zero real defects.
 *
 * Deleting it does not weaken the rule, it restores the rule's actual claim: an
 * import into a decision body is a finding, with one structural exception. A
 * decision is the innermost point of the sandwich, so imports run toward it and
 * never out of it - the reader imports the workflow, and nothing sits beneath the
 * pure core. A make body reaching a sibling module invents a layer there whose
 * purity no rule decides, because this rule fires on make bodies alone and so
 * never visits the module it reached. Appealing to a check on that module is
 * circular while no such check exists. The referenced code therefore belongs in
 * the deciding file or in the schema file of the type it operates on, or the
 * decision belongs in the file that already holds the code.
 *
 * The exception is the schema-file edge, and it is not the deleted list under a
 * new name. A list certifies a path its own author typed, and a path buys nothing
 * back - the module it names is read by nothing. The edge grants its pass by
 * specifier shape instead: a static import that is relative and whose basename
 * ends `.schema.js` or `.schema.ts`. That suffix is what makes a file the home of
 * a declared pure type, and it is the same suffix that enrolls the file in the
 * schema rules and in the mutation config's selected set, so naming a module that
 * way submits it to review rather than exempting it from one. Nothing here is a
 * path a reviewer has to remember to check, and no rename can silently
 * un-certify a module that carries the suffix contract.
 */

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
])

/** The global constants a decision may reference: language built-ins with no I/O. */
export const BENIGN_GLOBAL_NAMES: ReadonlySet<string> = new Set([
  // The pure ECMAScript namespaces: every member of each is deterministic and does
  // no I/O, so a decision calls them directly. `Math` is absent because of
  // `Math.random`, `Date` because it reads the clock - both stay findings. Without
  // these the rule pushed an author to alias `JSON.stringify` and `Object.keys` to
  // module-scope bindings purely to get past it, which is worse code than it replaced.
  'Array',
  'BigInt',
  'Boolean',
  'JSON',
  'Number',
  'Object',
  'RegExp',
  'String',
  'Symbol',
  'undefined',
  'NaN',
  'Infinity',
  'Error',
])

export const PURE_BODY_EXPECTED =
  'a Workflow.make decision body whose references resolve to parameters, const locals, declarations in this same file, benign builtins, or the sealed pure effect surface' as const

export const IO_IMPORT_ACTUAL =
  'a reference to an I/O module carrying Effects/Layers/services or a Node I/O builtin' as const

export const IO_GLOBAL_ACTUAL =
  'a reference to an I/O global (console, process, Deno, timers, fetch) inside the decision' as const

export const MODULE_STATE_ACTUAL =
  'a reference to mutable module-level state (a let/var binding) — mutation is a second path and its read can race' as const

export const MUTABLE_LOCAL_ACTUAL = 'a reference to a mutable local binding (let/var) inside the decision' as const

export const UNRESOLVABLE_ACTUAL =
  'an identifier that resolves to no parameter, no local binding, no import and no known global' as const

export const UNSEALED_IMPORT_ACTUAL =
  'a reference to an imported binding whose module this rule cannot read, so nothing decides whether it is pure' as const

export const UNSEALED_IMPORT_FIX =
  'a decision is the innermost point of the sandwich, so imports run toward it and never out of it: the reader imports the workflow. Move the referenced code into this file, or into the schema file of the type it operates on - a relative *.schema.js or *.schema.ts specifier is the one local import a decision may make - or move the decision into the file that already holds it; one of the three is the decision, and it cannot be split across them. Pass anything a caller must supply in as data' as const

export const IO_FIX =
  'hoist the I/O into the file that performs it and pass the result into the decision as data; delete the reference when nothing consumes it' as const

export const MODULE_STATE_FIX =
  'pass the module state in as a parameter and keep it out of the decision; delete the binding when nothing consumes it' as const

export const MUTABLE_LOCAL_FIX = 'declare it const, or delete it when nothing consumes it' as const

export const UNRESOLVABLE_FIX =
  'bind the name, import it, or delete the reference; a name this file cannot resolve is a name the decision cannot depend on' as const

export const CONTROL_FLOW_BANNED_EXPECTED =
  'a single decision path: one expression of exhaustive dispatch, with at most one defensive guard as the first statement converging immediately' as const

export const CONTROL_FLOW_BANNED_ACTUAL =
  'a control-flow construct that opens a second path inside the decision' as const

export const CONTROL_FLOW_BANNED_FIX =
  'extract the branching into the kernel and dispatch over a closed type; delete the branch when it guards nothing' as const

export const UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED = 'a decision body the rules can locate in this file' as const

export const UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL =
  'a Workflow.make decide property whose body is not visible from this file (missing, imported, a non-function value, or an unresolvable reference)' as const

export const UNRESOLVABLE_MAKE_ARGUMENT_FIX =
  'write the decision body inline, or bind it to a module-scope function in this file, so the one-path and purity obligations bind' as const

export const RUNTIME_IMPORT_ACTUAL =
  'a runtime import inside the decision body — import(...) or require(...) performs a module load when the decision runs' as const

export const RUNTIME_IMPORT_FIX =
  'hoist the import to the top of the file — a decision never imports at runtime; the module it loads must sit on the file\u2019s import lines where this rule reads it' as const

export const MODULE_MUTATION_ACTUAL =
  'an assignment, update, delete or mutating container-method call that changes a module-scope object from inside the decision' as const

export const MODULE_MUTATION_FIX =
  'pass the container in as data and write it where the caller owns it — a decision reads its inputs and returns a value; it never writes shared state' as const

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
      'A Workflow.make decision body performs no I/O visible in the file that declares it: an I/O import, module-level state, a mutable local, an I/O global and an unbound name are refused, and control flow is limited to one converging first-statement guard. A binding imported from a relative schema file is the one local import a decision may make - a schema file is the core home that declares a pure type and its operations. Whether any other imported binding is itself pure belongs to the module that declares it, and is decided where that module is linted.',
  },
  schema: [Options],
  messages: {
    ioImportReference: IO_IMPORT_REFERENCE_MESSAGE,
    ioGlobalReference: IO_IMPORT_REFERENCE_MESSAGE,
    moduleStateReference: IO_IMPORT_REFERENCE_MESSAGE,
    mutableLocalReference: IO_IMPORT_REFERENCE_MESSAGE,
    unresolvableReference: IO_IMPORT_REFERENCE_MESSAGE,
    unsealedImportReference: IO_IMPORT_REFERENCE_MESSAGE,
    runtimeImportReference: IO_IMPORT_REFERENCE_MESSAGE,
    moduleMutationReference: IO_IMPORT_REFERENCE_MESSAGE,
    controlFlowBanned: CONTROL_FLOW_BANNED_MESSAGE,
    unresolvableMakeArgument: CONTROL_FLOW_BANNED_MESSAGE,
  },
} as const
