import { createRuleTester } from './_tester.js'

import { schemaRecursiveUnionBudget } from '../schema-recursive-union-budget.js'

const ruleTester = createRuleTester()

ruleTester.run('schema-recursive-union-budget', schemaRecursiveUnionBudget, {
  valid: [
    {
      name: 'Should_Pass_When_ASuspendUnionDoesNotReferenceItself',
      code: `import { Schema as S } from 'effect'
export const X = S.suspend(() => S.Union([S.String]))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [],
})
