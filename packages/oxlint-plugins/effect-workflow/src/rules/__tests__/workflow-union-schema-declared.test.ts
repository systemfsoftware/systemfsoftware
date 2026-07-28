import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowUnionSchemaDeclared } from '../workflow-union-schema-declared.js'

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

const WORKFLOW = 'process-claim.workflow.ts'

const twoVariants = `
class Inject extends S.TaggedClass<Inject>()('Inject', {}) {}
class Skip extends S.TaggedClass<Skip>()('Skip', {}) {}
`

const bareAliasData = (name: string, variants: string, count: number) => ({
  name,
  expected: `const ${name} = S.Union(${variants}) paired with type ${name} = S.Schema.Type<typeof ${name}>`,
  actual: `${name} is a bare TS type alias over ${count} schema variants, so no runtime schema exists`,
  fix: `replace the alias with const ${name} = S.Union(${variants}) and type ${name} = S.Schema.Type<typeof ${name}>`,
})

ruleTester.run('workflow-union-schema-declared', workflowUnionSchemaDeclared, {
  valid: [
    {
      name: 'Should_Allow_SchemaUnion_When_DeclaredWithSUnion',
      code: `${twoVariants}
const RefVerdict = S.Union(Inject, Skip)
type RefVerdict = S.Schema.Type<typeof RefVerdict>
`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_LiteralUnion_When_NoSchemaVariants',
      code: `type How = 'subagent_type' | 'prompt'`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_PrimitiveUnion_When_NoSchemaVariants',
      code: `type Loose = string | number | undefined`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_SingleVariantAlias_When_BelowUnionThreshold',
      code: `${twoVariants}
type Only = Inject
`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_NullableVariant_When_OnlyOneSchemaVariant',
      code: `${twoVariants}
type Maybe = Inject | null
`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_ImportedTypeUnion_When_VariantsNotLocal',
      code: `type Foreign = HookDecision | HookResult`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_AnonymousVariant_When_NoNameToTrack',
      code: `export default class extends S.TaggedClass<Inject>()('Inject', {}) {}
type Pair = Inject | Skip
`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_NonSchemaSuperclass_When_NotTaggedClass',
      code: `class Inject extends Base {}
class Skip extends Base {}
type Pair = Inject | Skip
`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_NonTaggedSchemaClass_When_SuperCallIsNotTaggedClass',
      code: `class Inject extends S.Class<Inject>()('Inject', {}) {}
class Skip extends S.Class<Skip>()('Skip', {}) {}
type Pair = Inject | Skip
`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_BareAlias_When_NotWorkflowFile',
      code: `${twoVariants}
type RefVerdict = Inject | Skip
`,
      filename: 'process-claim.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_BareAlias_When_TwoSchemaVariants',
      code: `${twoVariants}
type RefVerdict = Inject | Skip
`,
      filename: WORKFLOW,
      errors: [
        {
          messageId: 'bareUnionAlias',
          data: bareAliasData('RefVerdict', 'Inject, Skip', 2),
        },
      ],
    },
    {
      name: 'Should_Report_BareAlias_When_TaggedErrorVariants',
      code: `
class AErr extends S.TaggedError<AErr>()('AErr', {}) {}
class BErr extends S.TaggedError<BErr>()('BErr', {}) {}
type Failure = AErr | BErr
`,
      filename: WORKFLOW,
      errors: [
        {
          messageId: 'bareUnionAlias',
          data: bareAliasData('Failure', 'AErr, BErr', 2),
        },
      ],
    },
    {
      name: 'Should_Report_BareAlias_When_MixedWithNonVariantMember',
      code: `${twoVariants}
type Loose = Inject | Skip | null
`,
      filename: WORKFLOW,
      errors: [
        {
          messageId: 'bareUnionAlias',
          data: bareAliasData('Loose', 'Inject, Skip', 2),
        },
      ],
    },
  ],
})
