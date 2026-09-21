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
      name: 'Should_StaySilent_When_SiblingInternalDirHasNoClimb',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from './internal/helper.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_ColocatedSrcTestImportsInternal',
      filename: '/repo/pkg/src/foo/__tests__/foo.workflow.property.test.ts',
      code: `import { Foo } from '../internal/Foo.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_UnderSrcFileReexportsSrc',
      filename: '/repo/pkg/src/rules/__tests__/helper.ts',
      code: `export { x } from '../src/mod.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_UnderSrcFileTypeImportsSrc',
      filename: '/repo/pkg/src/rules/__tests__/AstNode.tst.ts',
      code: `import type { X } from '../src/Thing.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_UnderSrcFileImportsSrc',
      filename: '/repo/pkg/src/rules/__tests__/helper.ts',
      code: `import { x } from '../src/mod.js'\n`,
    },
    {
      name: 'Should_StaySilent_When_UnderSrcFileDynamicImportsSrc',
      filename: '/repo/pkg/src/rules/__tests__/loader.ts',
      code: `const mod = await import('../src/mod.js')\n`,
    },
    {
      name: 'Should_StaySilent_When_PlainFileOutsideTestTreeImportsSrc',
      filename: '/repo/pkg/lib/helper.ts',
      code: `import { x } from '../src/mod.js'\n`,
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
    {
      name: 'Should_Report_When_TestClimbsIntoInternal',
      filename: '/repo/pkg/tests/a.integration.test.ts',
      code: `import { x } from '../internal/helper.js'\n`,
      errors: reachIn('../internal/helper.js'),
    },
    {
      name: 'Should_Report_When_FixtureHelperReexportsSrc',
      filename: '/repo/pkg/tests/__fixtures__/helper.ts',
      code: `export { x } from '../src/mod.js'\n`,
      errors: reachIn('../src/mod.js'),
    },
    {
      name: 'Should_Report_When_TstFileTypeImportsSrc',
      filename: '/repo/pkg/tests/AstNode.tst.ts',
      code: `import type { X } from '../src/Thing.js'\n`,
      errors: reachIn('../src/Thing.js'),
    },
    {
      name: 'Should_Report_When_DunderTestsHelperImportsSrc',
      filename: '/repo/pkg/__tests__/helper.ts',
      code: `import { x } from '../src/mod.js'\n`,
      errors: reachIn('../src/mod.js'),
    },
    {
      name: 'Should_Report_When_FixtureDynamicImportReachesSrc',
      filename: '/repo/pkg/tests/__fixtures__/loader.ts',
      code: `const mod = await import('../src/mod.js')\n`,
      errors: reachIn('../src/mod.js'),
    },
  ],
})
