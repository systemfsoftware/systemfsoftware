import { createRuleTester } from './_tester.js'

import { schemaCheckedElementNamed } from '../schema-checked-element-named.js'

const ruleTester = createRuleTester()

ruleTester.run('schema-checked-element-named', schemaCheckedElementNamed, {
  valid: [
    {
      name: 'Should_Ignore_When_APlainObjectIsPassedToMap',
      code: `import { Schema as S } from 'effect'
const X = S.Map({ a: S.String.pipe(S.check((v) => true)) })`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [],
})
