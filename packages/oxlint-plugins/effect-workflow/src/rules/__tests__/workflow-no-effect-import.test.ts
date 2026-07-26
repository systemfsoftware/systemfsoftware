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
      code: `import * as Either from 'effect/Either'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import * as Match from 'effect/Match'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import * as S from 'effect/Schema'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import * as Option from 'effect/Option'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import { Effect } from 'effect'`,
      filename: 'process-claim.executor.ts',
    },
    {
      code: `import { Effect } from 'some-other-lib'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `import * as Either from 'effect/Either'`,
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      code: `import { Effect } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'effectRuntimeImport' }],
    },
    {
      code: `import * as Effect from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'effectRuntimeImport' }],
    },
    {
      code: `import Effect from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'effectRuntimeImport' }],
    },
    {
      code: `import { Effect } from 'effect/Effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'effectRuntimeImport' }],
    },
    {
      code: `import { Either, Match } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import { Either } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import { Schema as S } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import Foo from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import { E as Effect } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import * as Foo from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import { type Either } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
    {
      code: `import { Effect, type Either } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'effectRuntimeImport' }],
    },
    {
      code: `import { 'Effect' as E } from 'effect'`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'topLevelEffectImport' }],
    },
  ],
})
