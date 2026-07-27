import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorNoLayerBinding } from '../executor-no-layer-binding.js'

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

ruleTester.run('executor-no-layer-binding', executorNoLayerBinding, {
  valid: [
    {
      name: 'Should_Allow_EffectGen_When_ExecutorFile',
      code: `Effect.gen(() => Effect.succeed(1))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EffectFn_When_ExecutorFile',
      code: `Effect.fn('ConfirmOrder')(function* () {})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EffectProvideSomethingElse_When_ExecutorFile',
      code: `Effect.provideSomethingElse(value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EffectSucceed_When_ExecutorFile',
      code: `Effect.succeed(value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_LayersSucceed_When_ExecutorFile',
      code: `Layers.succeed(value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_LowercaseLayer_When_ExecutorFile',
      code: `layer.succeed(value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedLayerAccess_When_ExecutorFile',
      code: `Layer['succeed'](value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedIdentifierLayerAccess_When_ExecutorFile',
      code: `Layer[method](value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NonIdentifierMemberObject_When_ExecutorFile',
      code: `getLayer().succeed(value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_BareSucceed_When_ExecutorFile',
      code: `succeed(value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EffectContextImport_When_ExecutorFile',
      code: `import { Context, Effect } from 'effect'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_TypeOnlyLayerImport_When_ExecutorFile',
      code: `import type { Layer } from 'effect'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_InlineTypeLayerImport_When_ExecutorFile',
      code: `import { type Layer, Effect } from 'effect'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_LocalLayerImport_When_ExecutorFile',
      code: `import { Layer } from './my-layer.js'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NamespaceAlias_When_ExecutorFile',
      code: `import * as L from 'effect/Layer'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_LayerBinding_When_RuntimeFile',
      code: `Layer.succeed(value); Effect.provide(value, layer); import { Layer } from 'effect'`,
      filename: 'runtime.ts',
    },
    {
      name: 'Should_Ignore_LayerBinding_When_HandlerFile',
      code: `Layer.succeed(value); Effect.provide(value, layer); import { Layer } from 'effect'`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Allow_NonIdentifierCallObject_When_ExecutorFile',
      code: `const live = makeLayer().succeed(Deps, gateway)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NestedMemberObject_When_ExecutorFile',
      code: `const live = app.layers.succeed(Deps, gateway)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_RuntimeProvide_When_ExecutorFile',
      code: `const scoped = Runtime.provide(program, layer)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_RuntimeProvideService_When_ExecutorFile',
      code: `const a = Runtime.provideService(program, Tag, value)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_RuntimeProvideServiceEffect_When_ExecutorFile',
      code: `const b = Runtime.provideServiceEffect(program, Tag, effect)`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_LayerSucceed_When_ExecutorFile',
      code: `Layer.succeed(Deps, gateway)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerConstruction',
          data: {
            name: 'Layer.succeed',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer constructed in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_LayerEffect_When_ExecutorFile',
      code: `Layer.effect(Deps, gateway)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerConstruction',
          data: {
            name: 'Layer.effect',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer constructed in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_LayerScoped_When_ExecutorFile',
      code: `Layer.scoped(Deps, gateway)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerConstruction',
          data: {
            name: 'Layer.scoped',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer constructed in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_LayerProvide_When_ExecutorFile',
      code: `Layer.provide(Deps, gateway)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerConstruction',
          data: {
            name: 'Layer.provide',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer constructed in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_EffectProvide_When_ExecutorFile',
      code: `Effect.provide(x, L)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'dependencyProvision',
          data: {
            name: 'Effect.provide',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a dependency provided inside the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_EffectProvideService_When_ExecutorFile',
      code: `Effect.provideService(x, T, v)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'dependencyProvision',
          data: {
            name: 'Effect.provideService',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a dependency provided inside the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_EffectProvideServiceEffect_When_ExecutorFile',
      code: `Effect.provideServiceEffect(x, T, e)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'dependencyProvision',
          data: {
            name: 'Effect.provideServiceEffect',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a dependency provided inside the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_EffectLayerValueImport_When_ExecutorFile',
      code: `import { Layer } from 'effect'`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerImport',
          data: {
            name: 'Layer',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer value import in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_EffectAndLayerValueImport_When_ExecutorFile',
      code: `import { Effect, Layer } from 'effect'`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerImport',
          data: {
            name: 'Layer',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer value import in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_LayerNamespaceImport_When_ExecutorFile',
      code: `import * as Layer from 'effect/Layer'`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'layerImport',
          data: {
            name: 'Layer',
            expected: 'the executor to declare its Tag and bind nothing',
            actual: 'a Layer value import in the executor',
            fix: 'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)',
          },
        },
      ],
    },
  ],
})
