import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoEffectImport } from '../workflow-no-effect-import.js'

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

ruleTester.run('workflow-no-effect-import', workflowNoEffectImport, {
  valid: [
    {
      name: 'Should_Pass_When_ImportingAllowlistedEither',
      code: `import * as Either from 'effect/Either'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ImportingAllowlistedMatch',
      code: `import * as Match from 'effect/Match'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ImportingAllowlistedSchema',
      code: `import * as S from 'effect/Schema'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ImportingAllowlistedOption',
      code: `import * as Option from 'effect/Option'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsEffectRuntime',
      code: `import { Effect } from 'effect'`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsEffectSubmodule',
      code: `import * as Effect from 'effect/Effect'`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonEffectLibraryExportsEffect',
      code: `import { Effect } from 'some-other-lib'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_EffectPrefixIsDifferentScope',
      code: `import * as Layer from 'effect-utils/Layer'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_EffectScopeIsDifferentPrefix',
      code: `import * as Ref from 'my-effect/Ref'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowImportsAllowlistedEither',
      code: `import * as Either from 'effect/Either'`,
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportEffectRuntime_When_TopLevelImportsNamedEffect',
      code: `import { Effect } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'effectRuntimeImport',
        data: {
          name: 'effect/Effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportEffectRuntime_When_TopLevelImportsNamespaceEffect',
      code: `import * as Effect from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'effectRuntimeImport',
        data: {
          name: 'effect/Effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportEffectRuntime_When_TopLevelImportsDefaultEffect',
      code: `import Effect from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'effectRuntimeImport',
        data: {
          name: 'effect/Effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportEffectRuntime_When_SubmoduleImportsNamedEffect',
      code: `import { Effect } from 'effect/Effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'effectRuntimeImport',
        data: {
          name: 'effect/Effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect/Effect',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportEffectRuntime_When_SubmoduleImportsNamespaceEffect',
      code: `import * as Effect from 'effect/Effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'effectRuntimeImport',
        data: {
          name: 'effect/Effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect/Effect',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_ImportingNamedAllowlistedMembersFromEffect',
      code: `import { Either, Match } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_ImportingNamedEitherFromEffect',
      code: `import { Either } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_ImportingNamedSchemaFromEffect',
      code: `import { Schema as S } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_ImportingDefaultFromEffect',
      code: `import Foo from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_AliasedImportReusesEffectName',
      code: `import { E as Effect } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_ImportingNamespaceFromEffect',
      code: `import * as Foo from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_ImportingTypeFromEffect',
      code: `import { type Either } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportEffectRuntime_When_MixedImportIncludesEffect',
      code: `import { Effect, type Either } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'effectRuntimeImport',
        data: {
          name: 'effect/Effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportTopLevel_When_StringSpecifierNamesEffect',
      code: `import { 'Effect' as E } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'topLevelEffectImport',
        data: {
          name: 'effect',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect',
          fix: 'import from the allowlisted submodule instead',
        },
      }],
    },
    {
      name: 'Should_ReportNonAllowlisted_When_ImportingLayerSubmodule',
      code: `import * as Layer from 'effect/Layer'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'nonAllowlistedSubmodule',
        data: {
          name: 'effect/Layer',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect/Layer',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
    {
      name: 'Should_ReportNonAllowlisted_When_ImportingClockSubmodule',
      code: `import * as Clock from 'effect/Clock'`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'nonAllowlistedSubmodule',
        data: {
          name: 'effect/Clock',
          expected: 'one of effect/Either, effect/Match, effect/Schema, effect/Option',
          actual: 'an import of effect/Clock',
          fix:
            'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
        },
      }],
    },
  ],
})
