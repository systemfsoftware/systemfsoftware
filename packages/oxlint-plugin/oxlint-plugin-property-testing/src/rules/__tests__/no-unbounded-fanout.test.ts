import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noUnboundedFanout } from '../no-unbounded-fanout.js'

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

const OBSERVER_SHAPE = `
import { Schema as S } from 'effect'
import { boundedUnion } from './bounded-union.kernel.js'

const Leaf = S.TaggedStruct('Leaf', { refinements: S.Literal(0, 1) })

const fields = <A>(inner: S.Schema<A, A, never>) => S.Array(inner)

const recurse = S.suspend(() => Recipe)

export const Recipe: S.Schema<Recipe> = boundedUnion('Recipe', {
  base: [Leaf],
  maxDepth: 1,
  recur: [
    S.TaggedStruct('Struct', { fields: fields(recurse) }),
  ],
})

export const Recipe2: S.Schema<Recipe> = boundedUnion('Recipe2', {
  base: [Leaf],
  maxDepth: 1,
  recur: [
    S.TaggedStruct('Struct', { fields: fields(recurse) }),
  ],
})
`

const OBSERVER_FILENAME = 'src/schema-recipe.observer.ts'

const EXPECTED_DATA = {
  name: 'S.Array(...) with no length bound',
  expected:
    'a numeric length bound on the collection arbitrary (S.Array / fc.array: maxLength; S.Record: maxLength or maxKeys) so fan-out is capped independently of the depth cap',
  actual:
    'the collection arbitrary reaches a property generator with no bound the rule can read — a recursion depth cap (maxDepth) bounds depth only, and per-case cost still scales with generated length',
  fix:
    "add a numeric maxLength (e.g. S.Array(inner, { maxLength: 3 }), fc.array(arb, { maxLength: 3 })); if the fan-out is deliberately unbounded, add this file's basename to the rule's exempt option",
}

ruleTester.run('no-unbounded-fanout', noUnboundedFanout, {
  valid: [
    {
      name: 'Should_StaySilent_When_ArrayHasMaxLength',
      code: `
import { Schema as S } from 'effect'
import { boundedUnion } from './bounded-union.kernel.js'

const Leaf = S.TaggedStruct('Leaf', { refinements: S.Literal(0, 1) })

const fields = <A>(inner: S.Schema<A, A, never>) => S.Array(inner, { maxLength: 3 })

const recurse = S.suspend(() => Recipe)

export const Recipe: S.Schema<Recipe> = boundedUnion('Recipe', {
  base: [Leaf],
  maxDepth: 1,
  recur: [
    S.TaggedStruct('Struct', { fields: fields(recurse) }),
  ],
})
`,
      filename: OBSERVER_FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArrayIsNotInAGenerator',
      code: `
import { Schema as S } from 'effect'

const makeTags = (): S.Schema<string[]> => S.Array(S.String)
`,
      filename: 'src/util.ts',
    },
    {
      name: 'Should_StaySilent_When_FileIsExempt',
      code: OBSERVER_SHAPE,
      filename: OBSERVER_FILENAME,
      options: [{ exempt: ['schema-recipe.observer.ts'] }],
    },
    {
      name: 'Should_StaySilent_When_MaxLengthIsZero',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const Empty = recipe(S.Array(S.String, { maxLength: 0 }))
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_ArrayIsInsidePlainSchemaDeclaration',
      code: `
import { Schema as S } from 'effect'

export const User = S.Struct({
  tags: S.Array(S.String),
})
`,
      filename: 'src/model.ts',
    },
    {
      name: 'Should_StaySilent_When_ArrayLivesInPassedCallback',
      code: `
import { defineRule } from '@oxlint/plugins'
import { Schema as S } from 'effect'

export const myRule = defineRule({
  create(context) {
    const parsed = S.decodeUnknownSync(S.Array(S.String))(context.options)
    return {}
  },
})
`,
      filename: 'src/rules/ban-things.ts',
    },
    {
      name: 'Should_StaySilent_When_FcArrayHasMaxLength',
      code: `
import { FastCheck as fc } from 'effect'

const recipe = (schema: unknown) => schema

export const Words = recipe(fc.array(fc.string(), { maxLength: 3 }))
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_RecordHasMaxKeysBound',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const Wire = recipe(S.Record({ key: S.String, value: S.Unknown, maxKeys: 5 }))
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_RecordHasMaxLengthBound',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const Wire = recipe(S.Record({ key: S.String, value: S.Unknown, maxLength: 5 }))
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_RecipeReferencesItself',
      code: `
const a = () => b()
const b = () => a()
export const R = a
`,
      filename: 'src/cycle.ts',
    },
    {
      name: 'Should_StaySilent_When_FileExportsNoRecipe',
      code: `
import { Schema as S } from 'effect'

const fields = <A>(inner: S.Schema<A, A, never>) => S.Array(inner)

export const config = { retries: 3 }
`,
      filename: 'src/config.ts',
    },
    {
      name: 'Should_StaySilent_When_PlainArrayIsNotACollectionCall',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const R = recipe(S.array(S.String))
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_ExportedFunctionMerelyDecodes',
      code: `
import { Schema as S } from 'effect'

export function denormalize(input: unknown) {
  const asRecord = S.decodeUnknownOption(S.Record({ key: S.String, value: S.Unknown }))
  return asRecord(input)
}
`,
      filename: 'src/tool-input.kernel.ts',
    },
    {
      name: 'Should_StaySilent_When_ExportedFunctionExpressionIsNotARecipe',
      code: `
import { Schema as S } from 'effect'

export const R = function () {
  return S.Array(S.String)
}
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_ExportedArrowIsNotARecipe',
      code: `
import { Schema as S } from 'effect'

const make = () => S.Array(S.String)

export const R = make
`,
      filename: 'src/fixtures.ts',
    },
    {
      name: 'Should_StaySilent_When_ExportIsAPlainObjectLiteral',
      code: `
import { Schema as S } from 'effect'

export const Config = { tags: S.Array(S.String) }
`,
      filename: 'src/model.ts',
    },
    {
      name: 'Should_StaySilent_When_ExportUsesDestructuringPattern',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const { first } = recipe(S.Array(S.String))
`,
      filename: 'src/fixtures.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ArrayArbitraryHasNoLengthBound',
      code: OBSERVER_SHAPE,
      filename: OBSERVER_FILENAME,
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
          line: 7,
        },
      ],
    },
    {
      name: 'Should_Report_When_SuppressionListOmitsThisFile',
      code: OBSERVER_SHAPE,
      filename: OBSERVER_FILENAME,
      options: [{ exempt: ['other.ts'] }],
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_MaxLengthIsNonLiteral',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const LIMIT = 3

export const Tags = recipe(S.Array(S.String, { maxLength: LIMIT }))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: { ...EXPECTED_DATA, name: 'S.Array(...) with no length bound' },
        },
      ],
    },
    {
      name: 'Should_Report_When_ArrayOptionsObjectLacksMaxLength',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const Tags = recipe(S.Array(S.String, { minLength: 1 }))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: { ...EXPECTED_DATA, name: 'S.Array(...) with no length bound' },
        },
      ],
    },
    {
      name: 'Should_Report_When_ArrayOptionsIsNotAnObjectLiteral',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const opts = { maxLength: 3 }

export const Tags = recipe(S.Array(S.String, opts))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: { ...EXPECTED_DATA, name: 'S.Array(...) with no length bound' },
        },
      ],
    },
    {
      name: 'Should_Report_When_FcArrayHasNoLengthBound',
      code: `
import { FastCheck as fc } from 'effect'

const recipe = (schema: unknown) => schema

export const Numbers = recipe(fc.array(fc.integer()))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: { ...EXPECTED_DATA, name: 'fc.array(...) with no length bound' },
        },
      ],
    },
    {
      name: 'Should_Report_When_RecordHasNoLengthBound',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const Wire = recipe(S.Record({ key: S.String, value: S.Unknown }))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: { ...EXPECTED_DATA, name: 'S.Record(...) with no length bound' },
        },
      ],
    },
    {
      name: 'Should_Report_When_CalledFunctionDeclarationBuildsArray',
      code: `
import { Schema as S } from 'effect'
import { boundedUnion } from './bounded-union.kernel.js'

const Leaf = S.TaggedStruct('Leaf', { refinements: S.Literal(0, 1) })

function fields(inner: unknown) {
  return S.Array(inner)
}

const recurse = S.suspend(() => Recipe)

export const Recipe: S.Schema<Recipe> = boundedUnion('Recipe', {
  base: [Leaf],
  maxDepth: 1,
  recur: [
    S.TaggedStruct('Struct', { fields: fields(recurse) }),
  ],
})
`,
      filename: OBSERVER_FILENAME,
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_CalledFunctionExpressionBuildsArray',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const build = function (inner: unknown) {
  return S.Array(inner)
}

export const R = recipe(build(S.String))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_DefaultExportIsRecipe',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export default recipe(S.Array(S.String))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_ExportSpecifierIsRecipe',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const make = recipe(S.Array(S.String))

export { make }
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_BlockBodiedArrowBuildsArray',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const build = (inner: unknown) => {
  return S.Array(inner)
}

export const R = recipe(build(S.String))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_ConstInitBuildsArrayInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build() {
  const arr = S.Array(S.String)
  return arr
}

export const R = recipe(build())
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_ExpressionStatementBuildsArrayInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build() {
  make(S.Array(S.String))
}

export const R = recipe(build())
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_NestedBlockBuildsArrayInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build() {
  {
    const arr = S.Array(S.String)
  }
  return null
}

export const R = recipe(build())
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_IfElseBuildsArraysInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build(flag: boolean) {
  if (flag) {
    return S.Array(S.String)
  } else {
    return S.Array(S.Number)
  }
}

export const R = recipe(build(true))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_SwitchCaseBuildsArrayInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build(flag: number) {
  switch (flag) {
    case 1:
      return S.Array(S.String)
    default:
      return S.Array(S.Number, { maxLength: 3 })
  }
}

export const R = recipe(build(1))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_TryFinallyBuildsArrayInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build() {
  try {
    return S.Array(S.String)
  } finally {
    S.Array(S.Number)
  }
}

export const R = recipe(build())
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_LoopBodyBuildsArrayInsideCalledBuilder',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

function build(flags: readonly boolean[]) {
  for (const flag of flags) {
    return S.Array(S.String)
  }
  return S.Array(S.Number, { maxLength: 3 })
}

export const R = recipe(build([true]))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_SpreadArgumentCarriesArray',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const opts = { arr: S.Array(S.String) }

export const R = recipe({ ...opts })
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_MemberExpressionValueCarriesArray',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const holder = { arr: S.Array(S.String) }

export const R = recipe(holder.arr)
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_OptionsUseSpread',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const opts = { maxLength: 3 }

export const Tags = recipe(S.Array(S.String, { ...opts }))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_MaxLengthIsAStringLiteral',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export const Tags = recipe(S.Array(S.String, { maxLength: 'three' }))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_BuilderIsReachedThroughExportedBinding',
      code: `
import { Schema as S } from 'effect'

export const fields = (inner: unknown) => S.Array(inner)

export const Tags = fields(S.String)
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_RecipeIsReachedThroughAliasIdentifier',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

const real = recipe(S.Array(S.String))

export const Alias = real
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_AnExportedDeclarationHasNoInitializer',
      code: `
import { Schema as S } from 'effect'

const recipe = (schema: unknown) => schema

export let pending: unknown

export const Tags = recipe(S.Array(S.String))
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_Report_When_BuilderBindingIsItselfACall',
      code: `
import { Schema as S } from 'effect'

const make = (schema: unknown) => schema

const fields = make(S.Array(S.String))

export const Tags = fields(S.String)
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
    {
      name: 'Should_ReportOnce_When_TheSameArrayIsReferencedTwice',
      code: `
import { Schema as S } from 'effect'

const recipe = (first: unknown, second: unknown) => first

const shared = S.Array(S.String)

export const Tags = recipe(shared, shared)
`,
      filename: 'src/fixtures.ts',
      errors: [
        {
          messageId: 'unboundedFanout',
          data: EXPECTED_DATA,
        },
      ],
    },
  ],
})
