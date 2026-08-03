import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  PRODUCTION_IMPORT_ACTUAL,
  PRODUCTION_IMPORT_EXPECTED,
  PRODUCTION_IMPORT_FIX,
} from '../observer-no-production-import.config.js'
import { observerNoProductionImport } from '../observer-no-production-import.js'

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

const errorFor = (source: string) => ({
  messageId: 'productionObserverImport',
  data: {
    name: source,
    expected: PRODUCTION_IMPORT_EXPECTED,
    actual: PRODUCTION_IMPORT_ACTUAL,
    fix: PRODUCTION_IMPORT_FIX,
  },
})

ruleTester.run('observer-no-production-import', observerNoProductionImport, {
  valid: [
    {
      name: 'Should_Pass_When_TestFileImportsObserver',
      code: `import { runSteps } from '../step-harness.observer.js'`,
      filename: 'step-harness.test.ts',
    },
    {
      name: 'Should_Pass_When_SpecFileImportsObserver',
      code: `import { runSteps } from '../step-harness.observer.js'`,
      filename: 'step-harness.spec.ts',
    },
    {
      name: 'Should_Pass_When_ObserverFileImportsObserver',
      code: `import { runSteps } from '../run-steps.observer.ts'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_TestDirectoryImportsObserver',
      code: `import { runSteps } from '../../step-harness.observer.js'`,
      filename: 'src/__tests__/helpers.ts',
    },
    {
      name: 'Should_Pass_When_TestsDirectoryImportsObserver',
      code: `import { runSteps } from '../step-harness.observer.js'`,
      filename: 'src/tests/helpers.ts',
    },
    {
      name: 'Should_Pass_When_ToolingScriptImportsObserver',
      code: `import { runSteps } from '../step-harness.observer.js'`,
      filename: 'src/scripts/bench.ts',
    },
    {
      name: 'Should_Pass_When_ToolingBinImportsObserver',
      code: `import { runSteps } from '../step-harness.observer.js'`,
      filename: 'bin/run-harness.ts',
    },
    {
      name: 'Should_Pass_When_ProductionImportsNonObserver',
      code: `import { cancelOrder } from './cancel-order.workflow.ts'`,
      filename: 'order.service.ts',
    },
    {
      name: 'Should_Pass_When_ProductionExportsWithoutSource',
      code: `export { runSteps }`,
      filename: 'order.service.ts',
    },
    {
      name: 'Should_Pass_When_ImportingFileNamedObserverWord',
      code: `import { x } from '../observer.ts'`,
      filename: 'order.service.ts',
    },
    {
      name: 'Should_Pass_When_ImportingObserverTestFile',
      code: `import { x } from '../step-harness.observer.test.ts'`,
      filename: 'order.service.ts',
    },
    {
      name: 'Should_Pass_When_ImportingPlainSibling',
      code: `import { waitFor } from './wait-for.ts'`,
      filename: 'order.service.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ProductionImportsObserver',
      code: `import { runSteps } from '../step-harness.observer.js'`,
      filename: 'cancel-order.workflow.ts',
      errors: [errorFor('../step-harness.observer.js')],
    },
    {
      name: 'Should_Report_When_ProductionImportsObserverWithTsExtension',
      code: `import { runSteps } from '../step-harness.observer.ts'`,
      filename: 'order.executor.ts',
      errors: [errorFor('../step-harness.observer.ts')],
    },
    {
      name: 'Should_Report_When_ProductionTypeImportsObserver',
      code: `import type { Step } from './step.observer.ts'`,
      filename: 'order.handler.ts',
      errors: [errorFor('./step.observer.ts')],
    },
    {
      name: 'Should_Report_When_ProductionReexportsObserver',
      code: `export { runSteps } from './step-harness.observer.js'`,
      filename: 'order.store.ts',
      errors: [errorFor('./step-harness.observer.js')],
    },
    {
      name: 'Should_Report_When_ProductionReexportsAllObserver',
      code: `export * from './step-harness.observer.ts'`,
      filename: 'order.middleware.ts',
      errors: [errorFor('./step-harness.observer.ts')],
    },
  ],
})
