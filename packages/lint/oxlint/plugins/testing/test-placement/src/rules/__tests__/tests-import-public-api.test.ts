import { REACH_IN_ACTUAL, REACH_IN_EXPECTED, REACH_IN_FIX } from '../tests-import-public-api.config.js'
import { testsImportPublicApi } from '../tests-import-public-api.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const reachIn = (name: string) => [{
  messageId: 'sourceReachIn' as const,
  data: {
    name,
    expected: REACH_IN_EXPECTED,
    actual: REACH_IN_ACTUAL,
    fix: REACH_IN_FIX,
  },
}]

ruleTester.run('tests-import-public-api', testsImportPublicApi, {
  valid: [
    {
      name: 'Should_StaySilent_When_PackageNameIsImported',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from '@systemfsoftware/effect-gherkin-spec'\n`,
    },
    {
      name: 'Should_StaySilent_When_SiblingFixtureIsImported',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from './__fixtures__/x.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_ColocatedSrcTestImportsInternal',
      filename: '/repo/pkg/src/foo/__tests__/foo.workflow.property.test.ts',
      code: `import { Foo } from '../internal/Foo.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_SiblingInternalDirHasNoClimb',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from './internal/helper.js'\n`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TestImportsSrcMod',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from '../src/mod.js'\n`,
      errors: reachIn('../src/mod.js'),
    },
    {
      name: 'Should_Report_When_TestImportsSrcInternal',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from '../src/internal/Foo.js'\n`,
      errors: reachIn('../src/internal/Foo.js'),
    },
    {
      name: 'Should_Report_When_TypeImportReachesSrc',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import type { X } from '../src/mod.js'\n`,
      errors: reachIn('../src/mod.js'),
    },
    {
      name: 'Should_Report_When_ReexportReachesSrc',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `export { x } from '../src/mod.js'\n`,
      errors: reachIn('../src/mod.js'),
    },
    {
      name: 'Should_Report_When_DynamicImportReachesSrc',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `// fixture: the rule must see ImportExpression\nconst mod = await import('../src/mod.js')\n`,
      errors: reachIn('../src/mod.js'),
    },
  ],
})
