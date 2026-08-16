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
  'a Workflow.make decision body whose references resolve to parameters, local const bindings, or imports of audited-pure modules'
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
const UNRESOLVABLE_ACTUAL =
  'a reference the purity rule cannot classify: an import from a module the audit has not sealed, or an unresolved global'
const IO_FIX =
  'hoist the I/O into the file that performs it and pass the result into the decision as data; delete the reference when nothing consumes it'
const MODULE_STATE_FIX =
  'pass the module state in as a parameter and keep it out of the decision; delete the binding when nothing consumes it'
const MUTABLE_LOCAL_FIX = 'declare it const, or delete it when nothing consumes it'
const UNRESOLVABLE_FIX =
  'read the imported module, seal its classification in make-body-purity.config.ts, or move the reference out of the decision; delete it when nothing consumes it'

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
      name: 'Should_Pass_When_BodyReferencesAnAuditedKernelImport',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { restartIndicesFor } from './restart-decision.kernel.js'

export const decide = Workflow.make(
  (command: { readonly strategy: 'one_for_one' }): Result.Result<readonly number[], never> =>
    Match.value(command).pipe(
      Match.when({ strategy: 'one_for_one' }, () => Result.succeed(restartIndicesFor('one_for_one', 0, 1))),
      Match.orElse(() => Result.succeed([])),
    ),
)`,
    },
    {
      name: 'Should_Pass_When_BodyReferencesAnAuditedWorkflowImport',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import { admitSurvivorsRun } from './survivors.workflow.js'

export const adapter = Workflow.make(
  ({ input }: { readonly input: unknown }): Result.Result<unknown, never> =>
    Result.map(admitSurvivorsRun(input), (decision) => decision),
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
      filename: 'cancel-order.executor.ts',
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
  ],
  invalid: [
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
      name: 'Should_ReportUnresolvable_When_BodyImportsAnUnsealedLocalModule',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { mystery } from './mystery.module.js'

Workflow.make((path: string) => mystery(path))`,
      errors: [
        referenceError('unresolvableReference', 'a reference to mystery', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX),
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
  ],
})
