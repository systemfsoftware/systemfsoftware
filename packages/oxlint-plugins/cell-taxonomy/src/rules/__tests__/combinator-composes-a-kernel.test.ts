import { ACTUAL, EXPECTED, FIX } from '../combinator-composes-a-kernel.config.js'
import { combinatorComposesAKernel } from '../combinator-composes-a-kernel.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const missingKernel = (name: string) => [{
  messageId: 'kernelImportMissing',
  data: {
    name,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
}]

ruleTester.run('combinator-composes-a-kernel', combinatorComposesAKernel, {
  valid: [
    {
      name: 'Should_Allow_KernelImport_When_CombinatorFile',
      code: "import { kernel } from './x.kernel.js'\nexport const combine = kernel()",
      filename: '/repo/pkg/src/a.combinator.ts',
    },
    {
      name: 'Should_Allow_KernelReExport_When_CombinatorFile',
      code: "export { kernel } from './x.kernel.js'",
      filename: '/repo/pkg/src/a.combinator.ts',
    },
    {
      name: 'Should_Allow_TwoKernelImports_When_CombinatorFile',
      code:
        "import { a } from './a.kernel.js'\nimport { b } from './b.kernel.js'\nexport const combine = (x: number) => b(a(x))",
      filename: '/repo/pkg/src/a.combinator.ts',
    },
    {
      name: 'Should_Allow_KernelImport_When_CombinatorAlsoImportsSchema',
      code:
        "import { kernel } from './x.kernel.js'\nimport type { Domain } from './y.schema.js'\nexport const combine = (d: Domain) => kernel(d)",
      filename: '/repo/pkg/src/a.combinator.ts',
    },
    {
      name: 'Should_Ignore_When_NotCombinatorFile',
      code: 'export const x = 1',
      filename: '/repo/pkg/src/a.kernel.ts',
    },
    {
      name: 'Should_Ignore_KernelFileWithNoKernelImport',
      code: 'export const pure = (x: number) => x + 1',
      filename: '/repo/pkg/src/a.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_CombinatorImportsOnlySchema',
      code: "import type { Domain } from './y.schema.js'\nexport const combine = (d: Domain) => d",
      filename: '/repo/pkg/src/a.combinator.ts',
      errors: missingKernel('a.combinator.ts'),
    },
    {
      name: 'Should_Report_When_CombinatorHasNoImports',
      code: 'export const combine = (x: number) => x + 1',
      filename: '/repo/pkg/src/a.combinator.ts',
      errors: missingKernel('a.combinator.ts'),
    },
    {
      name: 'Should_Report_When_CombinatorImportsOnlyNonKernelModules',
      code: "import { Effect } from 'effect'\nimport { domain } from './y.schema.js'\nexport const combine = domain",
      filename: '/repo/pkg/src/a.combinator.ts',
      errors: missingKernel('a.combinator.ts'),
    },
    {
      name: 'Should_Report_When_CombinatorIsEmpty',
      code: '',
      filename: '/repo/pkg/src/a.combinator.ts',
      errors: missingKernel('a.combinator.ts'),
    },
  ],
})
