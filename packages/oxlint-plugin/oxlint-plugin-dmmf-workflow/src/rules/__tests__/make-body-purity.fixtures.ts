export const PURE_BODY_EXPECTED =
  'a Workflow.make decision body whose references resolve to parameters, const locals, declarations in this same file, benign builtins, or the sealed pure effect surface'
export const CONTROL_EXPECTED =
  'a single decision path: one expression of exhaustive dispatch, with at most one defensive guard as the first statement converging immediately'
export const CONTROL_ACTUAL = 'a control-flow construct that opens a second path inside the decision'
export const CONTROL_FIX =
  'extract the branching into the kernel and dispatch over a closed type; delete the branch when it guards nothing'
export const IO_ACTUAL = 'a reference to an I/O module carrying Effects/Layers/services or a Node I/O builtin'
export const IO_GLOBAL_ACTUAL =
  'a reference to an I/O global (console, process, Deno, timers, fetch) inside the decision'
export const MODULE_STATE_ACTUAL =
  'a reference to mutable module-level state (a let/var binding) — mutation is a second path and its read can race'
export const MUTABLE_LOCAL_ACTUAL = 'a reference to a mutable local binding (let/var) inside the decision'
export const UNSEALED_IMPORT_ACTUAL =
  'a reference to an imported binding whose module this rule cannot read, so nothing decides whether it is pure'
export const UNRESOLVABLE_ACTUAL =
  'an identifier that resolves to no parameter, no local binding, no import and no known global'
export const IO_FIX =
  'hoist the I/O into the file that performs it and pass the result into the decision as data; delete the reference when nothing consumes it'
export const MODULE_STATE_FIX =
  'pass the module state in as a parameter and keep it out of the decision; delete the binding when nothing consumes it'
export const MUTABLE_LOCAL_FIX = 'declare it const, or delete it when nothing consumes it'
export const UNRESOLVABLE_FIX =
  'bind the name, import it, or delete the reference; a name this file cannot resolve is a name the decision cannot depend on'
export const RUNTIME_IMPORT_ACTUAL =
  'a runtime import inside the decision body — import(...) or require(...) performs a module load when the decision runs'
export const RUNTIME_IMPORT_FIX =
  'hoist the import to the top of the file — a decision never imports at runtime; the module it loads must sit on the file\u2019s import lines where this rule reads it'
export const MODULE_MUTATION_ACTUAL =
  'an assignment, update, delete or mutating container-method call that changes a module-scope object from inside the decision'
export const MODULE_MUTATION_FIX =
  'pass the container in as data and write it where the caller owns it — a decision reads its inputs and returns a value; it never writes shared state'
export const UNRESOLVABLE_MAKE_ARGUMENT_NAME = 'the decide property of this Workflow.make call'
export const UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED = 'a decision body the rules can locate in this file'
export const UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL =
  'a Workflow.make decide property whose body is not visible from this file (missing, imported, a non-function value, or an unresolvable reference)'
export const UNRESOLVABLE_MAKE_ARGUMENT_FIX =
  'write the decision body inline, or bind it to a module-scope function in this file, so the one-path and purity obligations bind'

export const referenceError = (
  messageId: string,
  name: string,
  actual: string,
  fix: string,
): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId,
  data: { name, expected: PURE_BODY_EXPECTED, actual, fix },
})

export const controlError = (name: string): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId: 'controlFlowBanned',
  data: { name, expected: CONTROL_EXPECTED, actual: CONTROL_ACTUAL, fix: CONTROL_FIX },
})

export const unresolvableMakeArgumentError = {
  messageId: 'unresolvableMakeArgument',
  data: {
    name: UNRESOLVABLE_MAKE_ARGUMENT_NAME,
    expected: UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED,
    actual: UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL,
    fix: UNRESOLVABLE_MAKE_ARGUMENT_FIX,
  },
} as const

/**
 * The fixture prelude: the standard imports and the schema classes the options
 * object names. `decide` is the decision slot the boundary resolves; every body
 * under test is written as its value.
 */
export const PRELUDE = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
`

export const makeWorkflow = (decide: string, moduleLevel = ''): string =>
  `${PRELUDE}
${moduleLevel}
export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: ${decide} })`
