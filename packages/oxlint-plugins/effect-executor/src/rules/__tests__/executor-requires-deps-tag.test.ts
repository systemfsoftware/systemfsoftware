import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorRequiresDepsTag } from '../executor-requires-deps-tag.js'

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

const filename = 'confirm-order.executor.ts'

ruleTester.run('executor-requires-deps-tag', executorRequiresDepsTag, {
  valid: [
    {
      name: 'Should_Pass_When_ExecutorDeclaresContextTag',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: () => void }
>() {}`,
      filename,
    },
    {
      name: 'Should_Pass_When_ExecutorDeclaresEffectService',
      code: `import { Effect } from 'effect'

export class ConfirmOrderExecutorDeps extends Effect.Service('ConfirmOrderExecutorDeps')() {}`,
      filename,
    },
    {
      name: 'Should_Pass_When_ExecutorDeclaresEffectTag',
      code: `import { Effect } from 'effect'

export class ConfirmOrderExecutorDeps extends Effect.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  {}
>() {}`,
      filename,
    },
    {
      name: 'Should_Pass_When_ExecutorDeclaresGenericTagAsConst',
      code: `import { Context } from 'effect'

export const ConfirmOrderExecutorDeps = Context.GenericTag<{ readonly capture: () => void }>(
  'ConfirmOrderExecutorDeps',
)`,
      filename,
    },
    {
      name: 'Should_Ignore_TaglessModule_When_NotAnExecutorFile',
      code: `export const confirmOrder = () => undefined`,
      filename: 'confirm-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExecutorAcquiresProviderTagItDoesNotOwn',
      code: `import { Effect } from 'effect'
import { TomlLoader } from '@systemfsoftware/omp-utils'

export const confirmOrder = Effect.fn('confirmOrder')(function* () {
  const loader = yield* TomlLoader
  return yield* loader.load()
})`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_ClassHasNoSuperClass',
      code: `export class Plain {}`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_ClassExtendsPlainIdentifier',
      code: `import { Base } from './base.js'

export class ConfirmOrderExecutorDeps extends Base {}`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_TagAccessIsComputed',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context['Tag']('ConfirmOrderExecutorDeps')() {}`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_TagOwnerIsNotAPlainIdentifier',
      code: `export class ConfirmOrderExecutorDeps extends ns.Context.Tag('ConfirmOrderExecutorDeps')() {}`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_MemberIsNotATagConstructor',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Layer('ConfirmOrderExecutorDeps')() {}`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_OwnerIsNotATagNamespace',
      code: `import { Ctx } from './ctx.js'

export class ConfirmOrderExecutorDeps extends Ctx.Tag('ConfirmOrderExecutorDeps')() {}`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_VariableHasNoInitialiser',
      code: `declare let confirmOrderDeps: unknown`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
    {
      name: 'Should_Report_When_VariableInitialiserIsNotATagCall',
      code: `export const confirmOrderDeps = makeDeps('confirmOrder')`,
      filename,
      errors: [{ messageId: 'missingDepsTag' }],
    },
  ],
})
