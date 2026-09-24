import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { makeBodyPurity } from '../make-body-purity.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const PURE_BODY_EXPECTED =
  'a Workflow.make decision body whose references resolve to parameters, const locals, declarations in this same file, benign builtins, or the sealed pure effect surface'
const CONTROL_EXPECTED =
  'a single decision path: one expression of exhaustive dispatch, with at most one defensive guard as the first statement converging immediately'
const CONTROL_ACTUAL = 'a control-flow construct that opens a second path inside the decision'
const CONTROL_FIX =
  'extract the branching into the kernel and dispatch over a closed type; delete the branch when it guards nothing'
const IO_ACTUAL = 'a reference to an I/O module carrying Effects/Layers/services or a Node I/O builtin'
const IO_GLOBAL_ACTUAL = 'a reference to an I/O global (console, process, Deno, timers, fetch) inside the decision'
const MODULE_STATE_ACTUAL =
  'a reference to mutable module-level state (a let/var binding) — mutation is a second path and its read can race'
const MUTABLE_LOCAL_ACTUAL = 'a reference to a mutable local binding (let/var) inside the decision'
const UNSEALED_IMPORT_ACTUAL =
  'a reference to an imported binding whose module this rule cannot read, so nothing decides whether it is pure'
const UNSEALED_IMPORT_FIX =
  'a decision is the innermost point of the sandwich, so imports run toward it and never out of it: the reader imports the workflow. Move the referenced code into this file, or move the decision into the file that already holds it - one of the two is the decision, and it cannot be split across both. Pass anything a caller must supply in as data'
const UNRESOLVABLE_ACTUAL =
  'an identifier that resolves to no parameter, no local binding, no import and no known global'
const IO_FIX =
  'hoist the I/O into the file that performs it and pass the result into the decision as data; delete the reference when nothing consumes it'
const MODULE_STATE_FIX =
  'pass the module state in as a parameter and keep it out of the decision; delete the binding when nothing consumes it'
const MUTABLE_LOCAL_FIX = 'declare it const, or delete it when nothing consumes it'
const UNRESOLVABLE_FIX =
  'bind the name, import it, or delete the reference; a name this file cannot resolve is a name the decision cannot depend on'
const RUNTIME_IMPORT_ACTUAL =
  'a runtime import inside the decision body — import(...) or require(...) performs a module load when the decision runs'
const RUNTIME_IMPORT_FIX =
  'hoist the import to the top of the file — a decision never imports at runtime; the module it loads must sit on the file\u2019s import lines where this rule reads it'
const MODULE_MUTATION_ACTUAL =
  'an assignment, update, delete or mutating container-method call that changes a module-scope object from inside the decision'
const MODULE_MUTATION_FIX =
  'pass the container in as data and write it where the caller owns it — a decision reads its inputs and returns a value; it never writes shared state'
const UNRESOLVABLE_MAKE_ARGUMENT_NAME = 'the decide property of this Workflow.make call'
const UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED = 'a decision body the rules can locate in this file'
const UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL =
  'a Workflow.make decide property whose body is not visible from this file (missing, imported, a non-function value, or an unresolvable reference)'
const UNRESOLVABLE_MAKE_ARGUMENT_FIX =
  'write the decision body inline, or bind it to a module-scope function in this file, so the one-path and purity obligations bind'

const referenceError = (
  messageId: string,
  name: string,
  actual: string,
  fix: string,
): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId,
  data: { name, expected: PURE_BODY_EXPECTED, actual, fix },
})

const controlError = (name: string): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId: 'controlFlowBanned',
  data: { name, expected: CONTROL_EXPECTED, actual: CONTROL_ACTUAL, fix: CONTROL_FIX },
})

const unresolvableMakeArgumentError = {
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
const PRELUDE = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
`

const makeWorkflow = (decide: string, moduleLevel = ''): string =>
  `${PRELUDE}
${moduleLevel}
export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: ${decide} })`

ruleTester.run('make-body-purity', makeBodyPurity, {
  valid: [
    {
      name: 'Should_Pass_When_BodyReferencesOnlyParamsAndPureImports',
      code: makeWorkflow(`(command: { readonly tag: 'a' | 'b' }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed('a')),
      Match.tag('b', () => Result.succeed('b')),
      Match.exhaustive,
    )`),
    },
    {
      name: 'Should_Pass_When_BodyReferencesModuleSchemaClasses',
      code: `${PRELUDE}
export class DecisionA extends S.TaggedClass<DecisionA>()('DecisionA', {}) {}

export const workflow = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (command: { readonly tag: 'a' }): Result.Result<DecisionA, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed(DecisionA.make())),
      Match.exhaustive,
    ),
})`,
    },
    {
      name: 'Should_Pass_TheAliasedWorkflowImport',
      code: `import { Workflow as W } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const workflow = W.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (command: { readonly tag: 'a' }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed('a')),
      Match.exhaustive,
    ),
})`,
    },
    {
      name: 'Should_Pass_TheNamespaceWorkflowImport',
      code: `import * as Workflow from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const workflow = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (command: { readonly tag: 'a' }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed('a')),
      Match.exhaustive,
    ),
})`,
    },
    {
      name: 'Should_Follow_AModuleScopeFunctionReference',
      code: `${PRELUDE}
const decide = (command: { readonly tag: 'a' }): Result.Result<string, never> =>
  Match.value(command).pipe(
    Match.tag('a', () => Result.succeed('a')),
    Match.exhaustive,
  )

export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: decide })`,
    },
    {
      // The shorthand property binds the same reference: `{ decide }` is `decide: decide`.
      name: 'Should_Follow_AShorthandDecidePropertyReference',
      code: `${PRELUDE}
const decide = (command: { readonly tag: 'a' }): Result.Result<string, never> =>
  Match.value(command).pipe(
    Match.tag('a', () => Result.succeed('a')),
    Match.exhaustive,
  )

export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
    },
    {
      name: 'Should_Pass_When_OnlyTheFirstStatementIsAConvergingGuard',
      code: makeWorkflow(`(command: { readonly n?: number }) => {
  if (command.n === undefined) return Result.fail('missing' as never)
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
}`),
    },
    {
      name: 'Should_Pass_When_FunctionExpressionBodyHasAConvergingFirstGuard',
      code: makeWorkflow(`function (command: { readonly n?: number }) {
  if (command.n === undefined) return Result.fail('missing' as never)
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
}`),
    },
    {
      name: 'Should_Pass_When_GuardTestUsesOrAndNullishCoalescing',
      code: makeWorkflow(`(command: { readonly n?: number }) => {
  if (command.n === undefined || command.n === null) {
    throw new Error('unreachable: property-tested')
  }
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
}`),
    },
    {
      name: 'Should_Pass_When_BodyDeclaresPureConstLocals',
      code: makeWorkflow(`(input: { readonly n: number }) => {
  const doubled = input.n * 2
  return Match.value(input).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed(\`other: \${doubled}\`)),
  )
}`),
    },
    {
      name: 'Should_Ignore_TheSameImpureCode_Outside_TheMakeBoundary',
      code: `import * as fs from 'node:fs'
import * as Match from 'effect/Match'

const outside = (path: string): string => {
  if (path === '') return ''
  const data = fs.readFileSync(path, 'utf-8')
  return Match.value(data).pipe(
    Match.when({ empty: true }, () => 'empty'),
    Match.orElse(() => data),
  )
}`,
    },
    {
      name: 'Should_Ignore_When_TheBoundaryIsShadowedByALocalBinding',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as fs from 'node:fs'

const Workflow = { make: (options: unknown) => options }
Workflow.make({ command: null, decide: (path: string) => fs.readFileSync(path, 'utf-8') })`,
    },
    {
      name: 'Should_Ignore_When_TheFileImportsNoWorkflow',
      code: `import * as fs from 'node:fs'
const x = fs.readFileSync('/etc/hosts', 'utf-8')`,
    },
    {
      name: 'Should_Ignore_WhenTheCalleeIsAnotherModuleWorkflow',
      code: `import { Workflow } from 'some-other-package'
import * as fs from 'node:fs'

Workflow.make({ command: null, decide: (path: string) => fs.readFileSync(path, 'utf-8') })`,
    },
    {
      name: 'Should_Pass_AProductionShapedBody_DespiteTheExecutorSuffix',
      code: makeWorkflow(
        `(command: { readonly exitSuccess: boolean; readonly intensity: number }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.when({ exitSuccess: true }, () => Result.succeed('continue')),
      Match.when({ exitSuccess: false, intensity: 0 }, () => Result.fail('exhausted' as never)),
      Match.orElse(() => Result.succeed('restart')),
    )`,
      ),
      filename: 'CancelOrderExecutor.ts',
    },
    {
      name: 'Should_Pass_When_AFixtureInATestFileUsesATernary',
      code: makeWorkflow(`(command: { readonly ok: boolean }): Result.Result<string, never> =>
    command.ok ? Result.succeed('yes') : Result.fail('no' as never)`),
      filename: 'interpreter.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_BuiltinsAndAsConstAppearInTheBody',
      code: makeWorkflow(`(command: { readonly n: number | undefined }): Result.Result<number, never> => {
  if (command.n === undefined) return Result.fail('missing' as never)
  const input = { command } as const
  return Match.value(input).pipe(
    Match.when({ command: { n: 0 } }, () => Result.succeed(0)),
    Match.orElse(() => Result.succeed(command.n)),
  )
}`),
    },
    {
      // A same-file pure helper remains a pass: the classifier follows the
      // const-arrow and scans it like the body itself, and an impurity inside
      // would surface there.
      name: 'Should_Pass_When_BodyCallsASameFileConstArrowPureHelper',
      code: makeWorkflow(
        `(x: number): Result.Result<number, never> => Result.succeed(double(x))`,
        `const double = (x: number): number => x * 2`,
      ),
    },
    {
      // Alias resolution must make the body get *scanned*, not make aliasing illegal.
      name: 'Should_Pass_When_AnAliasedMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const W = Workflow
export const workflow = W.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (x: number): Result.Result<number, never> => Result.succeed(x + 1),
})`,
    },
    {
      name: 'Should_Pass_When_AComputedMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const workflow = Workflow['make']({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (x: number): Result.Result<number, never> => Result.succeed(x + 1),
})`,
    },
    {
      name: 'Should_Pass_When_ABoundMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const workflow = Workflow.make.bind(Workflow)({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (x: number): Result.Result<number, never> => Result.succeed(x + 1),
})`,
    },
    {
      name: 'Should_Pass_When_ADestructuredMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const { make } = Workflow
export const workflow = make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (x: number): Result.Result<number, never> => Result.succeed(x + 1),
})`,
    },
    {
      name: 'Should_Pass_When_ADestructuredRenamedMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const { make: m } = Workflow
export const workflow = m({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (x: number): Result.Result<number, never> => Result.succeed(x + 1),
})`,
    },
    {
      name: 'Should_Pass_When_AnAliasChainBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const W = Workflow
const V = W
export const workflow = V.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (x: number): Result.Result<number, never> => Result.succeed(x + 1),
})`,
    },
    {
      // The one canonical way to alias a pure module is a renamed import; the
      // local name must never be what the sealed-pure verdict keys on.
      name: 'Should_Pass_When_ARenamedEffectRootImportIsPure',
      code: makeWorkflow(`(x: number) => Arr.range(0, x).length`, `import { Array as Arr } from 'effect'`),
    },
    {
      name: 'Should_Pass_When_ANamespaceEffectSubpathImportIsPure',
      code: makeWorkflow(`(x: number) => Arr.makeBy(x, (i) => i).length`, `import * as Arr from 'effect/Array'`),
    },
    {
      // An object literal of only literal-valued properties is a constant
      // record; reading it from the decision is a pure module-value read.
      name: 'Should_Pass_When_BodyReadsAModuleConstantRecord',
      code: makeWorkflow(
        `(x: number) => Number(x <= LIMITS.max)`,
        `const LIMITS = { max: 10, name: 'request' } as const`,
      ),
    },
    {
      // A record carrying functions is only followed for the members the body
      // actually executes: reading a literal member never runs the method.
      name: 'Should_Pass_When_BodyReadsOnlyALiteralMemberOfAMixedRecord',
      code: makeWorkflow(
        `(x: number) => Number(x <= helpers.LIMIT)`,
        `const helpers = {
  LIMIT: 10,
  label: (x: number) => String(x),
}`,
      ),
    },
    {
      // A pure local container mutated by the decision stays exempt: the
      // module-scope container rule fires on shared state only.
      name: 'Should_Pass_When_BodyMutatesAConstLocalContainer',
      code: makeWorkflow(`(input: { readonly n: number }) => {
  const seen = { count: 0 }
  seen.count += input.n
  return seen.count
}`),
    },
  ],
  invalid: [
    {
      // Imports run toward the decision, never out of it: the reader imports the
      // workflow. A make body reaching a sibling module invents a layer beneath
      // the pure core, and no rule checks that layer - make-body-purity fires on
      // make bodies alone. The allowlist that once admitted these certified
      // modules it never opened and un-certified them on rename.
      name: 'Should_ReportUnsealedImport_When_BodyCallsASiblingModule',
      code: makeWorkflow(
        `(command: { readonly strategy: 'one_for_one' }): Result.Result<readonly number[], never> =>
    Match.value(command).pipe(
      Match.when({ strategy: 'one_for_one' }, () => Result.succeed(restartIndicesFor('one_for_one', 0, 1))),
      Match.orElse(() => Result.succeed([])),
    )`,
        `import { restartIndicesFor } from './RestartDecision.js'`,
      ),
      errors: [
        referenceError(
          'unsealedImportReference',
          'a reference to restartIndicesFor',
          UNSEALED_IMPORT_ACTUAL,
          UNSEALED_IMPORT_FIX,
        ),
      ],
    },
    {
      // A workflow wrapping a workflow is the same inversion one level up.
      name: 'Should_ReportUnsealedImport_When_ADecisionWrapsAnotherWorkflow',
      code: makeWorkflow(
        `({ input }: { readonly input: unknown }): Result.Result<unknown, never> =>
    Result.map(admitSurvivorsRun(input), (decision) => decision)`,
        `import { admitSurvivorsRun } from './Survivors.workflow.js'`,
      ),
      errors: [
        referenceError(
          'unsealedImportReference',
          'a reference to admitSurvivorsRun',
          UNSEALED_IMPORT_ACTUAL,
          UNSEALED_IMPORT_FIX,
        ),
      ],
    },
    {
      name: 'Should_ReportUnsealedImport_When_BodyCallsAThirdPartyBinding',
      code: makeWorkflow(
        `(command: { readonly versions: readonly string[] }) => maxSatisfying(command.versions, '*')`,
        `import { maxSatisfying } from 'semver'`,
      ),
      errors: [
        referenceError(
          'unsealedImportReference',
          'a reference to maxSatisfying',
          UNSEALED_IMPORT_ACTUAL,
          UNSEALED_IMPORT_FIX,
        ),
      ],
    },
    {
      // What `unresolvable` still means: a name bound by nothing this file can see.
      name: 'Should_ReportUnresolvable_When_BodyReferencesAnUnboundName',
      code: makeWorkflow(`(path: string) => mystery(path)`),
      errors: [
        referenceError('unresolvableReference', 'a reference to mystery', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyReferencesANodeIoBinding',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as fs from 'node:fs'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: (path: string) => fs.readFileSync(path, 'utf-8') })`,
      errors: [
        referenceError('ioImportReference', 'a reference to fs', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyReferencesAnEffectCarrierSubpath',
      code: makeWorkflow(
        `(command: { readonly n: number }) => Effect.succeed(command.n)`,
        `import * as Effect from 'effect/Effect'`,
      ),
      errors: [
        referenceError('ioImportReference', 'a reference to Effect', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyReferencesAnEffectRootCarrier',
      code: makeWorkflow(
        `(command: { readonly n: number }) => Effect.succeed(command.n)`,
        `import { Effect } from 'effect'`,
      ),
      errors: [
        referenceError('ioImportReference', 'a reference to Effect', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_BodyInvokesConsole',
      code: makeWorkflow(`(command: { readonly n: number }) => console.log(command.n)`),
      errors: [
        referenceError('ioGlobalReference', 'a reference to console', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleState_When_BodyCapturesAModuleLet',
      code: makeWorkflow(`(command: { readonly n: number }) => (attempts += command.n)`, `let attempts = 0`),
      errors: [
        referenceError('moduleStateReference', 'a reference to attempts', MODULE_STATE_ACTUAL, MODULE_STATE_FIX),
      ],
    },
    {
      name: 'Should_ReportMutableLocal_When_BodyDeclaresALetLocal',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  let total = command.n
  return total
}`),
      errors: [
        referenceError('mutableLocalReference', 'a reference to total', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyImportsAnUnauditedEffectRootCarrier',
      code: makeWorkflow(
        `(command: { readonly n: number }) => Random.nextIntBetween(0, command.n)`,
        `import { Random } from 'effect'`,
      ),
      errors: [
        referenceError('ioImportReference', 'a reference to Random', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyCallsAModuleHelperThatPerformsIo',
      code: makeWorkflow(
        `(path: string) => readAll(path)`,
        `import * as fs from 'node:fs'

const readAll = (path: string): string => fs.readFileSync(path, 'utf-8')`,
      ),
      errors: [
        referenceError('ioImportReference', 'a reference to fs', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      // The decision slot is read by name: a missing `decide` property leaves no
      // body to judge, and an unlocatable decision is a finding, not silence.
      name: 'Should_ReportUnresolvableMakeArgument_When_TheDecidePropertyIsMissing',
      code: `${PRELUDE}
export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never })`,
      errors: [unresolvableMakeArgumentError],
    },
    {
      name: 'Should_ReportUnresolvableMakeArgument_When_TheDecisionIsImported',
      code: `${PRELUDE}
import { decideElsewhere } from './elsewhere.workflow.js'

export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: decideElsewhere })`,
      errors: [unresolvableMakeArgumentError],
    },
    {
      // A shorthand `decide` property whose only binding is an import resolves to
      // no body in this file: the report fires exactly as for a written reference.
      name: 'Should_ReportUnresolvableMakeArgument_When_TheShorthandDecisionIsImported',
      code: `${PRELUDE}
import { decide } from './elsewhere.workflow.js'

export const workflow = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
      errors: [unresolvableMakeArgumentError],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyHasAnIfPastTheFirstStatement',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  const doubled = command.n * 2
  if (doubled === 0) return Result.succeed('zero')
  return Result.succeed('other')
}`),
      errors: [
        controlError('an if statement inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_GuardDoesNotConvergeImmediately',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  if (command.n === 0) {
    Result.succeed('zero')
  }
  return Result.succeed('other')
}`),
      errors: [
        {
          messageId: 'controlFlowBanned',
          data: {
            name: 'an if statement inside the decision body',
            expected: CONTROL_EXPECTED,
            actual: CONTROL_ACTUAL,
            fix: CONTROL_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesATernary',
      code: makeWorkflow(`(command: { readonly n: number }) =>
  command.n === 0 ? Result.succeed('zero') : Result.succeed('other')`),
      errors: [
        controlError('a ternary (? :) inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesAndOrOr',
      code: makeWorkflow(`(command: { readonly n?: number }) => Result.succeed(command.n && command.n)`),
      errors: [
        controlError('a logical expression (&& or ||) inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesAForLoop',
      code: makeWorkflow(`(command: { readonly n: number }) => {
  let sum = 0
  for (let i = 0; i < command.n; i++) sum += i
  return Result.succeed(sum)
}`),
      errors: [
        referenceError('mutableLocalReference', 'a reference to sum', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
        controlError('a for loop inside the decision body'),
        referenceError('mutableLocalReference', 'a reference to i', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesASwitchStatement',
      code: makeWorkflow(`(command: { readonly tag: string }) => {
  switch (command.tag) {
    case 'a': return Result.succeed('a')
    default: return Result.succeed('other')
  }
}`),
      errors: [
        controlError('a switch statement inside the decision body'),
      ],
    },
    {
      // Hole 1: `const W = Workflow` defeated the boundary collector entirely -
      // the callee object resolved to a Variable, not an ImportBinding, so the
      // body was never scanned and the construction never counted.
      name: 'Should_ReportIoGlobal_When_AnAliasedMakeBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const W = Workflow
export const d = W.make({ command: Cmd, decision: Decision, error: S.Never, decide: (x: number) => { fetch(\`https://example.com/\${x}\`) } })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      // The general defect: the boundary judged a syntactic shape (callee
      // object is an ImportBinding, property is an Identifier) instead of
      // resolving where the callee comes from. Every indirection walked past.
      name: 'Should_ReportIoGlobal_When_AComputedMakeBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const d = Workflow['make']({ command: Cmd, decision: Decision, error: S.Never, decide: (x: number) => { fetch(\`https://example.com/\${x}\`) } })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_ABoundMakeBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const d = Workflow.make.bind(Workflow)({ command: Cmd, decision: Decision, error: S.Never, decide: (x: number) => { fetch(\`https://example.com/\${x}\`) } })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_ADestructuredMakeBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const { make } = Workflow
export const d = make({ command: Cmd, decision: Decision, error: S.Never, decide: (x: number) => { fetch(\`https://example.com/\${x}\`) } })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_AnAliasChainBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const W = Workflow
const V = W
export const d = V.make({ command: Cmd, decision: Decision, error: S.Never, decide: (x: number) => { fetch(\`https://example.com/\${x}\`) } })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      // The shorthand decision binds the same reference the written form does, so
      // its body is scanned like any other: the fetch inside is a finding.
      name: 'Should_ReportIoGlobal_When_AShorthandDecideBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

const decide = (x: number) => {
  fetch(\`https://example.com/\${x}\`)
}
export const d = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      // Hole 2: a function smuggled inside an object record was never entered -
      // only const-arrows and function declarations were followed, so the
      // Math.random inside the method stayed invisible. Referencing the member
      // follows exactly the touched function into the scan.
      name: 'Should_ReportUnresolvable_When_BodyCallsAMethodOfAModuleRecord',
      code: makeWorkflow(
        `(x: number) => helpers.bad(x)`,
        `const helpers = { bad(x: number): number { return Math.random() * x } }`,
      ),
      errors: [
        referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyCallsAFunctionValuedRecordProperty',
      code: makeWorkflow(
        `(x: number) => helpers.bad(x)`,
        `const helpers = { bad: (x: number): number => Math.random() * x }`,
      ),
      errors: [
        referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      // Hole 3: a dynamic import contributes no identifier reference, so the
      // scope walk saw only a local const. A decision imports nothing at
      // runtime - this needs no exemption.
      name: 'Should_ReportRuntimeImport_When_BodyImportsDynamically',
      code: makeWorkflow(`async (x: number) => {
  const fs = await import('node:fs')
  return fs.readFileSync('/etc/hostname', 'utf-8').length + x
}`),
      errors: [
        referenceError('runtimeImportReference', 'a runtime import', RUNTIME_IMPORT_ACTUAL, RUNTIME_IMPORT_FIX),
      ],
    },
    {
      name: 'Should_ReportRuntimeImport_When_BodyCallsRequire',
      code: makeWorkflow(`(path: string) => {
  const fs = require('node:fs')
  return fs.readFileSync(path, 'utf-8').length
}`),
      errors: [
        referenceError('runtimeImportReference', 'a runtime import', RUNTIME_IMPORT_ACTUAL, RUNTIME_IMPORT_FIX),
      ],
    },
    {
      // Hole 4: only let/var bindings classified as module state, so mutating a
      // field of a const object record passed. Writing a module-scope const
      // container from inside the decision is the same shared-state mutation.
      name: 'Should_ReportModuleMutation_When_BodyAssignsToAModuleConstField',
      code: makeWorkflow(
        `(x: number) => { state.count += x; return state.count }`,
        `const state = { count: 0 }`,
      ),
      errors: [
        referenceError(
          'moduleMutationReference',
          'a mutation of state.count',
          MODULE_MUTATION_ACTUAL,
          MODULE_MUTATION_FIX,
        ),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyUpdatesAModuleConstField',
      code: makeWorkflow(
        `(x: number) => { state.count++; return state.count }`,
        `const state = { count: 0 }`,
      ),
      errors: [
        referenceError(
          'moduleMutationReference',
          'a mutation of state.count',
          MODULE_MUTATION_ACTUAL,
          MODULE_MUTATION_FIX,
        ),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyPushesToAModuleConstContainer',
      code: makeWorkflow(
        `(x: number) => { state.items.push(x); return x }`,
        `const state = { items: [] as readonly number[] }`,
      ),
      errors: [
        referenceError(
          'moduleMutationReference',
          'a mutating method call (state.items.push)',
          MODULE_MUTATION_ACTUAL,
          MODULE_MUTATION_FIX,
        ),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyCallsMapSetOnAModuleConst',
      code: makeWorkflow(
        `(x: number) => { seen.set('x', x); return x }`,
        `const seen = new Map<string, number>()`,
      ),
      errors: [
        referenceError(
          'moduleMutationReference',
          'a mutating method call (seen.set)',
          MODULE_MUTATION_ACTUAL,
          MODULE_MUTATION_FIX,
        ),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyAddsToAModuleConstSet',
      code: makeWorkflow(
        `(x: number) => { seen.add(x); return x }`,
        `const seen = new Set<number>()`,
      ),
      errors: [
        referenceError(
          'moduleMutationReference',
          'a mutating method call (seen.add)',
          MODULE_MUTATION_ACTUAL,
          MODULE_MUTATION_FIX,
        ),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyDeletesAModuleConstField',
      code: makeWorkflow(
        `(x: number) => { delete state.count; return x }`,
        `const state = { count: 1 }`,
      ),
      errors: [
        referenceError(
          'moduleMutationReference',
          'a mutation of state.count',
          MODULE_MUTATION_ACTUAL,
          MODULE_MUTATION_FIX,
        ),
      ],
    },
    {
      // Hole 5: a getter runs I/O behind a plain property read - the read is
      // the access, so entering the getter into the scan makes Math.random a
      // finding; a call-only follow would miss it.
      name: 'Should_ReportUnresolvable_When_BodyReadsAModuleGetterThatRunsIo',
      code: makeWorkflow(
        `(x: number) => obj.v + x`,
        `const obj = { get v() { return Math.random() } }`,
      ),
      errors: [
        referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
  ],
})
