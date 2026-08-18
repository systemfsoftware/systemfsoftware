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

ruleTester.run('make-body-purity', makeBodyPurity, {
  valid: [
    {
      name: 'Should_Pass_When_BodyReferencesOnlyParamsAndPureImports',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make(
  (command: { readonly tag: 'a' | 'b' }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed('a')),
      Match.tag('b', () => Result.succeed('b')),
      Match.exhaustive,
    ),
)`,
    },
    {
      name: 'Should_Pass_When_BodyReferencesModuleSchemaClasses',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class DecisionA extends S.TaggedClass<DecisionA>()('DecisionA', {}) {}

export const decide = Workflow.make(
  (command: { readonly tag: 'a' }): Result.Result<DecisionA, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed(DecisionA.make())),
      Match.exhaustive,
    ),
)`,
    },
    {
      name: 'Should_Pass_TheAliasedWorkflowImport',
      code: `import { Workflow as W } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = W.make(
  (command: { readonly tag: 'a' }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed('a')),
      Match.exhaustive,
    ),
)`,
    },
    {
      name: 'Should_Pass_TheNamespaceWorkflowImport',
      code: `import * as Workflow from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make(
  (command: { readonly tag: 'a' }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.tag('a', () => Result.succeed('a')),
      Match.exhaustive,
    ),
)`,
    },
    {
      name: 'Should_Follow_AModuleScopeFunctionReference',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

const decide = (command: { readonly tag: 'a' }): Result.Result<string, never> =>
  Match.value(command).pipe(
    Match.tag('a', () => Result.succeed('a')),
    Match.exhaustive,
  )

export const workflow = Workflow.make(decide)`,
    },
    {
      name: 'Should_Pass_When_OnlyTheFirstStatementIsAConvergingGuard',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make((command: { readonly n?: number }) => {
  if (command.n === undefined) return Result.fail('missing' as never)
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
})`,
    },
    {
      name: 'Should_Pass_When_FunctionExpressionBodyHasAConvergingFirstGuard',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make(function (command: { readonly n?: number }) {
  if (command.n === undefined) return Result.fail('missing' as never)
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
})`,
    },
    {
      name: 'Should_Pass_When_GuardTestUsesOrAndNullishCoalescing',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make((command: { readonly n?: number }) => {
  if (command.n === undefined || command.n === null) {
    throw new Error('unreachable: property-tested')
  }
  return Match.value(command).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed('other')),
  )
})`,
    },
    {
      name: 'Should_Pass_When_BodyDeclaresPureConstLocals',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make((input: { readonly n: number }) => {
  const doubled = input.n * 2
  return Match.value(input).pipe(
    Match.when({ n: 0 }, () => Result.succeed('zero')),
    Match.orElse(() => Result.succeed(\`other: \${doubled}\`)),
  )
})`,
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

const Workflow = { make: (f: unknown) => f }
Workflow.make((path: string) => fs.readFileSync(path, 'utf-8'))`,
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

Workflow.make((path: string) => fs.readFileSync(path, 'utf-8'))`,
    },
    {
      name: 'Should_Pass_AProductionShapedBody_DespiteTheExecutorSuffix',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make(
  (command: { readonly exitSuccess: boolean; readonly intensity: number }): Result.Result<string, never> =>
    Match.value(command).pipe(
      Match.when({ exitSuccess: true }, () => Result.succeed('continue')),
      Match.when({ exitSuccess: false, intensity: 0 }, () => Result.fail('exhausted' as never)),
      Match.orElse(() => Result.succeed('restart')),
    ),
)`,
      filename: 'CancelOrderExecutor.ts',
    },
    {
      name: 'Should_Pass_When_AFixtureInATestFileUsesATernary',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

export const decide = Workflow.make(
  (command: { readonly ok: boolean }): Result.Result<string, never> =>
    command.ok ? Result.succeed('yes') : Result.fail('no' as never),
)`,
      filename: 'interpreter.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_BuiltinsAndAsConstAppearInTheBody',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export const decide = Workflow.make((command: { readonly n: number | undefined }): Result.Result<number, never> => {
  if (command.n === undefined) return Result.fail('missing' as never)
  const input = { command } as const
  return Match.value(input).pipe(
    Match.when({ command: { n: 0 } }, () => Result.succeed(0)),
    Match.orElse(() => Result.succeed(command.n)),
  )
})`,
    },
    {
      // A same-file pure helper remains a pass: the classifier follows the
      // const-arrow and scans it like the body itself, and an impurity inside
      // would surface there.
      name: 'Should_Pass_When_BodyCallsASameFileConstArrowPureHelper',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

const double = (x: number): number => x * 2

export const decide = Workflow.make((x: number): Result.Result<number, never> => Result.succeed(double(x)))`,
    },
    {
      // Alias resolution must make the body get *scanned*, not make aliasing illegal.
      name: 'Should_Pass_When_AnAliasedMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

const W = Workflow
export const decide = W.make((x: number): Result.Result<number, never> => Result.succeed(x + 1))`,
    },
    {
      name: 'Should_Pass_When_AComputedMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

export const decide = Workflow['make']((x: number): Result.Result<number, never> => Result.succeed(x + 1))`,
    },
    {
      name: 'Should_Pass_When_ABoundMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

export const decide = Workflow.make.bind(Workflow)((x: number): Result.Result<number, never> => Result.succeed(x + 1))`,
    },
    {
      name: 'Should_Pass_When_ADestructuredMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

const { make } = Workflow
export const decide = make((x: number): Result.Result<number, never> => Result.succeed(x + 1))`,
    },
    {
      name: 'Should_Pass_When_ADestructuredRenamedMakeBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

const { make: m } = Workflow
export const decide = m((x: number): Result.Result<number, never> => Result.succeed(x + 1))`,
    },
    {
      name: 'Should_Pass_When_AnAliasChainBodyIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

const W = Workflow
const V = W
export const decide = V.make((x: number): Result.Result<number, never> => Result.succeed(x + 1))`,
    },
    {
      // The one canonical way to alias a pure module is a renamed import; the
      // local name must never be what the sealed-pure verdict keys on.
      name: 'Should_Pass_When_ARenamedEffectRootImportIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr } from 'effect'

export const decide = Workflow.make((x: number) => Arr.range(0, x).length)`,
    },
    {
      name: 'Should_Pass_When_ANamespaceEffectSubpathImportIsPure',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'

export const decide = Workflow.make((x: number) => Arr.makeBy(x, (i) => i).length)`,
    },
    {
      // An object literal of only literal-valued properties is a constant
      // record; reading it from the decision is a pure module-value read.
      name: 'Should_Pass_When_BodyReadsAModuleConstantRecord',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const LIMITS = { max: 10, name: 'request' } as const
export const decide = Workflow.make((x: number) => Number(x <= LIMITS.max))`,
    },
    {
      // A record carrying functions is only followed for the members the body
      // actually executes: reading a literal member never runs the method.
      name: 'Should_Pass_When_BodyReadsOnlyALiteralMemberOfAMixedRecord',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const helpers = {
  LIMIT: 10,
  label: (x: number) => String(x),
}
export const decide = Workflow.make((x: number) => Number(x <= helpers.LIMIT))`,
    },
    {
      // A pure local container mutated by the decision stays exempt: the
      // module-scope container rule fires on shared state only.
      name: 'Should_Pass_When_BodyMutatesAConstLocalContainer',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

export const decide = Workflow.make((input: { readonly n: number }) => {
  const seen = { count: 0 }
  seen.count += input.n
  return seen.count
})`,
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
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { restartIndicesFor } from './RestartDecision.js'

export const decide = Workflow.make(
  (command: { readonly strategy: 'one_for_one' }): Result.Result<readonly number[], never> =>
    Match.value(command).pipe(
      Match.when({ strategy: 'one_for_one' }, () => Result.succeed(restartIndicesFor('one_for_one', 0, 1))),
      Match.orElse(() => Result.succeed([])),
    ),
)`,
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
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import { admitSurvivorsRun } from './Survivors.workflow.js'

export const adapter = Workflow.make(
  ({ input }: { readonly input: unknown }): Result.Result<unknown, never> =>
    Result.map(admitSurvivorsRun(input), (decision) => decision),
)`,
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
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { maxSatisfying } from 'semver'

Workflow.make((command: { readonly versions: readonly string[] }) => maxSatisfying(command.versions, '*'))`,
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
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

Workflow.make((path: string) => mystery(path))`,
      errors: [
        referenceError('unresolvableReference', 'a reference to mystery', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyReferencesANodeIoBinding',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as fs from 'node:fs'

Workflow.make((path: string) => fs.readFileSync(path, 'utf-8'))`,
      errors: [
        referenceError('ioImportReference', 'a reference to fs', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyReferencesAnEffectCarrierSubpath',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

Workflow.make((command: { readonly n: number }) => Effect.succeed(command.n))`,
      errors: [
        referenceError('ioImportReference', 'a reference to Effect', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyReferencesAnEffectRootCarrier',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'

Workflow.make((command: { readonly n: number }) => Effect.succeed(command.n))`,
      errors: [
        referenceError('ioImportReference', 'a reference to Effect', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_BodyInvokesConsole',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

Workflow.make((command: { readonly n: number }) => console.log(command.n))`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to console', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleState_When_BodyCapturesAModuleLet',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

let attempts = 0

Workflow.make((command: { readonly n: number }) => (attempts += command.n))`,
      errors: [
        referenceError('moduleStateReference', 'a reference to attempts', MODULE_STATE_ACTUAL, MODULE_STATE_FIX),
      ],
    },
    {
      name: 'Should_ReportMutableLocal_When_BodyDeclaresALetLocal',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

Workflow.make((command: { readonly n: number }) => {
  let total = command.n
  return total
})`,
      errors: [
        referenceError('mutableLocalReference', 'a reference to total', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyImportsAnUnauditedEffectRootCarrier',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Random } from 'effect'

Workflow.make((command: { readonly n: number }) => Random.nextIntBetween(0, command.n))`,
      errors: [
        referenceError('ioImportReference', 'a reference to Random', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoImport_When_BodyCallsAModuleHelperThatPerformsIo',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as fs from 'node:fs'

const readAll = (path: string): string => fs.readFileSync(path, 'utf-8')

Workflow.make((path: string) => readAll(path))`,
      errors: [
        referenceError('ioImportReference', 'a reference to fs', IO_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportUnresolvableMakeArgument_When_TheArgumentIsImported',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { decideElsewhere } from './elsewhere.workflow.js'

Workflow.make(decideElsewhere)`,
      errors: [
        {
          messageId: 'unresolvableMakeArgument',
          data: {
            name: 'the argument of this Workflow.make call',
            expected: 'a decision body the rules can locate in this file',
            actual:
              'a Workflow.make argument whose body is not visible from this file (imported, a non-function value, or an unresolvable reference)',
            fix:
              'move the decision body inline or into a module-scope function in this file so the one-path and purity obligations bind',
          },
        },
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyHasAnIfPastTheFirstStatement',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

Workflow.make((command: { readonly n: number }) => {
  const doubled = command.n * 2
  if (doubled === 0) return Result.succeed('zero')
  return Result.succeed('other')
})`,
      errors: [
        controlError('an if statement inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_GuardDoesNotConvergeImmediately',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

Workflow.make((command: { readonly n: number }) => {
  if (command.n === 0) {
    Result.succeed('zero')
  }
  return Result.succeed('other')
})`,
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
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

Workflow.make((command: { readonly n: number }) =>
  command.n === 0 ? Result.succeed('zero') : Result.succeed('other'))`,
      errors: [
        controlError('a ternary (? :) inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesAndOrOr',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

Workflow.make((command: { readonly n?: number }) => Result.succeed(command.n && command.n))`,
      errors: [
        controlError('a logical expression (&& or ||) inside the decision body'),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesAForLoop',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

Workflow.make((command: { readonly n: number }) => {
  let sum = 0
  for (let i = 0; i < command.n; i++) sum += i
  return Result.succeed(sum)
})`,
      errors: [
        referenceError('mutableLocalReference', 'a reference to sum', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
        controlError('a for loop inside the decision body'),
        referenceError('mutableLocalReference', 'a reference to i', MUTABLE_LOCAL_ACTUAL, MUTABLE_LOCAL_FIX),
      ],
    },
    {
      name: 'Should_ReportControlFlow_When_BodyUsesASwitchStatement',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

Workflow.make((command: { readonly tag: string }) => {
  switch (command.tag) {
    case 'a': return Result.succeed('a')
    default: return Result.succeed('other')
  }
})`,
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

const W = Workflow
export const d = W.make((x: number) => { fetch(\`https://example.com/\${x}\`) })`,
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

export const d = Workflow['make']((x: number) => { fetch(\`https://example.com/\${x}\`) })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_ABoundMakeBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

export const d = Workflow.make.bind(Workflow)((x: number) => { fetch(\`https://example.com/\${x}\`) })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_ADestructuredMakeBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const { make } = Workflow
export const d = make((x: number) => { fetch(\`https://example.com/\${x}\`) })`,
      errors: [
        referenceError('ioGlobalReference', 'a reference to fetch', IO_GLOBAL_ACTUAL, IO_FIX),
      ],
    },
    {
      name: 'Should_ReportIoGlobal_When_AnAliasChainBodyInvokesFetch',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const W = Workflow
const V = W
export const d = V.make((x: number) => { fetch(\`https://example.com/\${x}\`) })`,
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
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const helpers = { bad(x: number): number { return Math.random() * x } }
export const decide = Workflow.make((x: number) => helpers.bad(x))`,
      errors: [
        referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyCallsAFunctionValuedRecordProperty',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const helpers = { bad: (x: number): number => Math.random() * x }
export const decide = Workflow.make((x: number) => helpers.bad(x))`,
      errors: [
        referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
    {
      // Hole 3: a dynamic import contributes no identifier reference, so the
      // scope walk saw only a local const. A decision imports nothing at
      // runtime - this needs no exemption.
      name: 'Should_ReportRuntimeImport_When_BodyImportsDynamically',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

Workflow.make(async (x: number) => {
  const fs = await import('node:fs')
  return fs.readFileSync('/etc/hostname', 'utf-8').length + x
})`,
      errors: [
        referenceError('runtimeImportReference', 'a runtime import', RUNTIME_IMPORT_ACTUAL, RUNTIME_IMPORT_FIX),
      ],
    },
    {
      name: 'Should_ReportRuntimeImport_When_BodyCallsRequire',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

Workflow.make((path: string) => {
  const fs = require('node:fs')
  return fs.readFileSync(path, 'utf-8').length
})`,
      errors: [
        referenceError('runtimeImportReference', 'a runtime import', RUNTIME_IMPORT_ACTUAL, RUNTIME_IMPORT_FIX),
      ],
    },
    {
      // Hole 4: only let/var bindings classified as module state, so mutating a
      // field of a const object record passed. Writing a module-scope const
      // container from inside the decision is the same shared-state mutation.
      name: 'Should_ReportModuleMutation_When_BodyAssignsToAModuleConstField',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const state = { count: 0 }
Workflow.make((x: number) => { state.count += x; return state.count })`,
      errors: [
        referenceError('moduleMutationReference', 'a mutation of state.count', MODULE_MUTATION_ACTUAL, MODULE_MUTATION_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyUpdatesAModuleConstField',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const state = { count: 0 }
Workflow.make((x: number) => { state.count++; return state.count })`,
      errors: [
        referenceError('moduleMutationReference', 'a mutation of state.count', MODULE_MUTATION_ACTUAL, MODULE_MUTATION_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyPushesToAModuleConstContainer',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const state = { items: [] as readonly number[] }
Workflow.make((x: number) => { state.items.push(x); return x })`,
      errors: [
        referenceError('moduleMutationReference', 'a mutating method call (state.items.push)', MODULE_MUTATION_ACTUAL, MODULE_MUTATION_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyCallsMapSetOnAModuleConst',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const seen = new Map<string, number>()
Workflow.make((x: number) => { seen.set('x', x); return x })`,
      errors: [
        referenceError('moduleMutationReference', 'a mutating method call (seen.set)', MODULE_MUTATION_ACTUAL, MODULE_MUTATION_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyAddsToAModuleConstSet',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const seen = new Set<number>()
Workflow.make((x: number) => { seen.add(x); return x })`,
      errors: [
        referenceError('moduleMutationReference', 'a mutating method call (seen.add)', MODULE_MUTATION_ACTUAL, MODULE_MUTATION_FIX),
      ],
    },
    {
      name: 'Should_ReportModuleMutation_When_BodyDeletesAModuleConstField',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const state = { count: 1 }
Workflow.make((x: number) => { delete state.count; return x })`,
      errors: [
        referenceError('moduleMutationReference', 'a mutation of state.count', MODULE_MUTATION_ACTUAL, MODULE_MUTATION_FIX),
      ],
    },
    {
      // Hole 5: a getter runs I/O behind a plain property read - the read is
      // the access, so entering the getter into the scan makes Math.random a
      // finding; a call-only follow would miss it.
      name: 'Should_ReportUnresolvable_When_BodyReadsAModuleGetterThatRunsIo',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

const obj = { get v() { return Math.random() } }
export const decide = Workflow.make((x: number) => obj.v + x)`,
      errors: [
        referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
      ],
    },
  ],
})
