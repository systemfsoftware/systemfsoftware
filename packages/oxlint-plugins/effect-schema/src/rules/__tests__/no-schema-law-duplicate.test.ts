import { LAW_DUPLICATE_ACTUAL, LAW_DUPLICATE_EXPECTED, LAW_DUPLICATE_FIX } from '../no-schema-law-duplicate.config.js'
import { noSchemaLawDuplicate } from '../no-schema-law-duplicate.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const SCHEMA_PROPERTY = '/repo/pkg/src/money.schema.property.test.ts'

const duplicate = (name: string) => [{
  messageId: 'lawDuplicate',
  data: {
    name: `${name}(...) in a schema property test`,
    expected: LAW_DUPLICATE_EXPECTED,
    actual: LAW_DUPLICATE_ACTUAL,
    fix: LAW_DUPLICATE_FIX,
  },
}]

ruleTester.run('no-schema-law-duplicate', noSchemaLawDuplicate, {
  valid: [
    {
      name: 'Should_Allow_RefusalProperty_When_InSchemaPropertyTest',
      code: `it.prop('x', [gen], ([s]) => Either.isLeft(decode(s)))`,
      filename: SCHEMA_PROPERTY,
    },
    {
      name: 'Should_Allow_RuleOfSchemas_When_InGeneratedLawFile',
      code: `ruleOfSchemas('Money', Money)`,
      filename: '/repo/pkg/src/schema-laws.test.ts',
    },
    {
      name: 'Should_Allow_Equivalence_When_InWorkflowPropertyTest',
      code: `const eq = Schema.equivalence(Money)`,
      filename: '/repo/pkg/src/place-order.workflow.property.test.ts',
    },
    {
      name: 'Should_Allow_SimilarlyNamedCall_When_NotAGeneratedLawName',
      code: `const eq = Schema.equivalenceFor(Money)`,
      filename: SCHEMA_PROPERTY,
    },
    {
      name: 'Should_Allow_BareIdentifierCall_When_NotAGeneratedLawName',
      code: `refuse(Money)`,
      filename: SCHEMA_PROPERTY,
    },
    {
      name: 'Should_Allow_ComputedMemberCall_When_NameIsNotStatic',
      code: `Schema[key](Money)`,
      filename: SCHEMA_PROPERTY,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_RuleOfSchemas_When_InSchemaPropertyTest',
      code: `ruleOfSchemas('Money', Money)`,
      filename: SCHEMA_PROPERTY,
      errors: duplicate('ruleOfSchemas'),
    },
    {
      name: 'Should_Report_Equivalence_When_InSchemaPropertyTest',
      code: `const eq = Schema.equivalence(Money)`,
      filename: SCHEMA_PROPERTY,
      errors: duplicate('equivalence'),
    },
    {
      name: 'Should_Report_EncodedSchema_When_InSchemaPropertyTest',
      code: `const enc = S.encodedSchema(Money)`,
      filename: SCHEMA_PROPERTY,
      errors: duplicate('encodedSchema'),
    },
  ],
})
