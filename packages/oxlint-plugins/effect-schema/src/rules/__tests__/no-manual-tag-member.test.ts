import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { EXPECTED_TAGGED_STRUCT, NAME_SUFFIX } from '../no-manual-tag-member.config.js'
import { noManualTagMember } from '../no-manual-tag-member.js'

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

const expectedStructFor = (name: string): string => EXPECTED_TAGGED_STRUCT.replaceAll('<Name>', name)

const forbiddenError = (name: string, expected: string, fix: string) => ({
  messageId: 'forbidden' as const,
  data: {
    name,
    expected,
    actual: 'manual _tag member declaration',
    fix,
  },
})

const typeError = (alias: string, expected: string, fix: string) =>
  forbiddenError(`type ${alias} ${NAME_SUFFIX}`, expected, fix)

const interfaceError = (name: string, expected: string, fix: string) =>
  forbiddenError(`interface ${name} ${NAME_SUFFIX}`, expected, fix)

ruleTester.run('no-manual-tag-member', noManualTagMember, {
  valid: [
    // Acceptance Examples and value space
    {
      name: 'Should_StaySilent_WhenObjectExpressionCarriesTag',
      code: `
        const step = { _tag: 'Step', model, run }
      `,
    },
    {
      name: 'Should_StaySilent_WhenClassPropertyCarriesTag',
      code: `
        class MyEvent {
          readonly _tag = 'MyEvent'
        }
      `,
    },
    {
      name: 'Should_StaySilent_WhenTaggedClassPatternDeclared',
      code: `
        import { Schema as S } from 'effect'
        class MyClass extends S.TaggedClass<MyClass>()('MyClass', { value: S.Number }) {}
      `,
    },
    // KTD3 scope: single member, open/union/const tags, mixed and named-reference unions
    {
      name: 'Should_StaySilent_WhenSingleMemberLiteral',
      code: `
        type E = { readonly _tag: 'A' }
      `,
    },
    {
      name: 'Should_StaySilent_WhenOpenTag',
      code: `
        type E = { _tag: string } | { _tag: string }
      `,
    },
    {
      name: 'Should_StaySilent_WhenUnionTypedTag',
      code: `
        type E = { _tag: 'X' | 'Y' } | { _tag: 'A' | 'B' }
      `,
    },
    {
      name: 'Should_StaySilent_WhenConstReferencedTag',
      code: `
        const STEP_TAG = 'Step' as const
        type E = { _tag: STEP_TAG } | { _tag: STEP_TAG }
      `,
    },
    {
      name: 'Should_StaySilent_WhenUnionMemberIsNotLiteral',
      code: `
        type Known = { readonly kind: 'known' }
        type E = Known | { readonly _tag: 'A' }
      `,
    },
    {
      name: 'Should_StaySilent_WhenUnionOfNamedReferences',
      code: `
        type A = { readonly _tag: 'A' }
        type B = { readonly _tag: 'B' }
        type E = A | B
      `,
    },
    {
      name: 'Should_StaySilent_WhenRecursiveUnionMembersAreAliasedAnchors',
      code: `
        type Binary = { readonly _tag: 'Binary'; readonly left: Expr; readonly right: Expr }
        type Expr = Lit | Binary
        type Lit = { readonly _tag: 'Lit'; readonly value: number }

        const Lit: S.Schema<Lit> = S.TaggedStruct('Lit', { value: S.Number })
        const Binary: S.Schema<Binary> = S.suspend((): S.Schema<Binary> =>
          S.TaggedStruct('Binary', { left: Expr, right: Expr })
        )
        const Expr: S.Schema<Expr> = S.Union(Lit, Binary)
      `,
    },
    {
      name: 'Should_StaySilent_WhenShapeFile',
      code: `
        type Wire = { readonly _tag: 'A' } | { readonly _tag: 'B' }
      `,
      filename: 'place-order.shape.ts',
    },
    {
      name: 'Should_StaySilent_WhenInheritedInterfaceTag',
      code: `
        interface Child extends Proto {}
      `,
    },
    {
      name: 'Should_StaySilent_WhenMethodNamedTag',
      code: `
        type E = { _tag(): 'A' } | { _tag(): 'B' }
      `,
    },
    {
      name: 'Should_StaySilent_WhenComputedTagKey',
      code: `
        const KEY = '_tag'
        type E = { [KEY]: 'A' } | { [KEY]: 'B' }
      `,
    },
    {
      name: 'Should_StaySilent_WhenComputedLiteralTagKey',
      code: `
        type E = { ['_tag']: 'A' } | { ['_tag']: 'B' }
      `,
    },
    {
      name: 'Should_StaySilent_WhenNonStringLiteralTags',
      code: `
        type E = { _tag: 42 } | { _tag: -1 }
      `,
    },
    {
      name: 'Should_StaySilent_WhenTagMemberHasNoAnnotation',
      code: `
        type E = { _tag } | { _tag: string }
      `,
    },
    // KTD8 allow semantics
    {
      name: 'Should_StaySilent_WhenAllUnionMembersAllowlisted',
      code: `
        type Legacy = { readonly _tag: 'Legacy' } | { readonly _tag: 'Modern' }
      `,
      options: [{ allow: ['Legacy', 'Modern'] }],
    },
    {
      name: 'Should_StaySilent_WhenAllowMatchesCaseInsensitive',
      code: `
        type Legacy = { readonly _tag: 'Legacy' } | { readonly _tag: 'Modern' }
      `,
      options: [{ allow: ['legacy', 'MODERN'] }],
    },
    {
      name: 'Should_StaySilent_WhenInterfaceAllowlisted',
      code: `
        interface Success extends Proto {
          readonly _tag: 'Success'
        }
      `,
      options: [{ allow: ['Success'] }],
    },
  ],
  invalid: [
    // Acceptance Example: NodeFate shape
    {
      name: 'Should_Report_EachMember_WhenUnionOfLiteralTaggedMembers',
      code: `
        type NodeFate =
          | { readonly _tag: 'Alive' }
          | { readonly _tag: 'RemoveNow' }
      `,
      errors: [
        typeError(
          'NodeFate',
          expectedStructFor('NodeFate'),
          "replace each variant with S.TaggedStruct('Alive', { ... }) and declare type NodeFate = S.Schema.Type<typeof NodeFate>",
        ),
        typeError(
          'NodeFate',
          expectedStructFor('NodeFate'),
          "replace each variant with S.TaggedStruct('RemoveNow', { ... }) and declare type NodeFate = S.Schema.Type<typeof NodeFate>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenTaggedInterfaceIsErrorShaped',
      code: `
        interface StdoutWriteError {
          readonly _tag: 'stdout-write-error'
          readonly cause: unknown
        }
      `,
      errors: [
        interfaceError(
          'StdoutWriteError',
          'Schema.TaggedError(\'stdout-write-error\', { ... }) from effect (Schema as S from "effect")',
          "replace the declaration with S.TaggedError('stdout-write-error', { ... })",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenTaggedInterfaceIsPlain',
      code: `
        interface Step {
          readonly _tag: 'Step'
        }
      `,
      errors: [
        interfaceError(
          'Step',
          expectedStructFor('Step'),
          "replace each variant with S.TaggedStruct('Step', { ... }) and declare type Step = S.Schema.Type<typeof Step>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenRecursiveInterfaceCarriesTag',
      code: `
        interface Node {
          readonly _tag: 'Node'
          readonly children: ReadonlyArray<Node>
        }
      `,
      errors: [
        interfaceError(
          'Node',
          expectedStructFor('Node'),
          "replace each variant with S.TaggedStruct('Node', { ... }) and declare type Node = S.Schema.Type<typeof Node>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenRecursiveUnionMembersAreInlineLiterals',
      code: `
        type Expr =
          | { readonly _tag: 'Lit'; readonly value: number }
          | { readonly _tag: 'Binary'; readonly left: Expr; readonly right: Expr }
      `,
      errors: [
        typeError(
          'Expr',
          expectedStructFor('Expr'),
          "replace each variant with S.TaggedStruct('Lit', { ... }) and declare type Expr = S.Schema.Type<typeof Expr>",
        ),
        typeError(
          'Expr',
          expectedStructFor('Expr'),
          "replace each variant with S.TaggedStruct('Binary', { ... }) and declare type Expr = S.Schema.Type<typeof Expr>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeTaggedStruct_WhenMemberHasDomainFields',
      code: `
        type IntensitySpec =
          | { readonly _tag: 'Unbounded' }
          | { readonly _tag: 'Bounded'; readonly restarts: number; readonly window: Duration.Duration }
      `,
      errors: [
        typeError(
          'IntensitySpec',
          expectedStructFor('IntensitySpec'),
          "replace each variant with S.TaggedStruct('Unbounded', { ... }) and declare type IntensitySpec = S.Schema.Type<typeof IntensitySpec>",
        ),
        typeError(
          'IntensitySpec',
          expectedStructFor('IntensitySpec'),
          "replace each variant with S.TaggedStruct('Bounded', { ... }) and declare type IntensitySpec = S.Schema.Type<typeof IntensitySpec>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeDerivation_WhenMemberCarriesTypeParameter',
      code: `
        type PartialEncoded<A> =
          | { readonly _tag: 'PartialEncoded'; readonly value: A }
          | { readonly _tag: 'Encoded'; readonly value: A }
      `,
      errors: [
        typeError(
          'PartialEncoded',
          'a schema with type PartialEncoded = S.Schema.Type<typeof PartialEncoded> from effect (Schema as S from "effect")',
          'declare the schema (e.g. S.TaggedStruct union) and derive the type with S.Schema.Type<typeof PartialEncoded>',
        ),
        typeError(
          'PartialEncoded',
          'a schema with type PartialEncoded = S.Schema.Type<typeof PartialEncoded> from effect (Schema as S from "effect")',
          'declare the schema (e.g. S.TaggedStruct union) and derive the type with S.Schema.Type<typeof PartialEncoded>',
        ),
      ],
    },
    {
      name: 'Should_PrescribeDerivation_WhenParamReferenceIsNestedInArray',
      code: `
        type Wrapped<A> =
          | { readonly _tag: 'X'; readonly values: ReadonlyArray<A> }
          | { readonly _tag: 'Y' }
      `,
      errors: [
        typeError(
          'Wrapped',
          'a schema with type Wrapped = S.Schema.Type<typeof Wrapped> from effect (Schema as S from "effect")',
          'declare the schema (e.g. S.TaggedStruct union) and derive the type with S.Schema.Type<typeof Wrapped>',
        ),
        typeError(
          'Wrapped',
          expectedStructFor('Wrapped'),
          "replace each variant with S.TaggedStruct('Y', { ... }) and declare type Wrapped = S.Schema.Type<typeof Wrapped>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeTaggedStruct_WhenMemberReferencesNonParamType',
      code: `
        type Spec =
          | { readonly _tag: 'X'; readonly window: Duration.Duration }
          | { readonly _tag: 'Y' }
      `,
      errors: [
        typeError(
          'Spec',
          expectedStructFor('Spec'),
          "replace each variant with S.TaggedStruct('X', { ... }) and declare type Spec = S.Schema.Type<typeof Spec>",
        ),
        typeError(
          'Spec',
          expectedStructFor('Spec'),
          "replace each variant with S.TaggedStruct('Y', { ... }) and declare type Spec = S.Schema.Type<typeof Spec>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenAnonymousUnionMember',
      code: `
        declare const f: (x: { readonly _tag: 'A' } | { readonly _tag: 'B' }) => void
      `,
      errors: [
        forbiddenError(
          '<anonymous>',
          expectedStructFor('<Name>'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type <Name> = S.Schema.Type<typeof <Name>>",
        ),
        forbiddenError(
          '<anonymous>',
          expectedStructFor('<Name>'),
          "replace each variant with S.TaggedStruct('B', { ... }) and declare type <Name> = S.Schema.Type<typeof <Name>>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenStringLiteralKey',
      code: `
        type E = { '_tag': 'A' } | { '_tag': 'B' }
      `,
      errors: [
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('B', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenOptionalOrReadonlyTagMember',
      code: `
        type E = { readonly _tag?: 'A' } | { readonly _tag?: 'B' }
      `,
      errors: [
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('B', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenTaggedUnionInGenericArgument',
      code: `
        const box: Box<{ readonly _tag: 'A' } | { readonly _tag: 'B' }> = null as never
      `,
      errors: [
        forbiddenError(
          '<anonymous>',
          expectedStructFor('<Name>'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type <Name> = S.Schema.Type<typeof <Name>>",
        ),
        forbiddenError(
          '<anonymous>',
          expectedStructFor('<Name>'),
          "replace each variant with S.TaggedStruct('B', { ... }) and declare type <Name> = S.Schema.Type<typeof <Name>>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenNestedUnionFieldDeclaresTags',
      code: `
        type E =
          | { readonly _tag: 'A'; readonly nested: { readonly _tag: 'X' } | { readonly _tag: 'Y' } }
          | { readonly _tag: 'B' }
      `,
      errors: [
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('X', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('Y', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
        typeError(
          'E',
          expectedStructFor('E'),
          "replace each variant with S.TaggedStruct('B', { ... }) and declare type E = S.Schema.Type<typeof E>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeTaggedStruct_WhenErrorShapedMemberHasNonErrorField',
      code: `
        type M =
          | { readonly _tag: 'E'; readonly name: string; readonly count: number }
          | { readonly _tag: 'F' }
      `,
      errors: [
        typeError(
          'M',
          expectedStructFor('M'),
          "replace each variant with S.TaggedStruct('E', { ... }) and declare type M = S.Schema.Type<typeof M>",
        ),
        typeError(
          'M',
          expectedStructFor('M'),
          "replace each variant with S.TaggedStruct('F', { ... }) and declare type M = S.Schema.Type<typeof M>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeTaggedStruct_WhenGenericMemberIgnoresItsTypeParameter',
      code: `
        type G<T> =
          | { readonly _tag: 'A'; readonly value: string }
          | { readonly _tag: 'B' }
      `,
      errors: [
        typeError(
          'G',
          expectedStructFor('G'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type G = S.Schema.Type<typeof G>",
        ),
        typeError(
          'G',
          expectedStructFor('G'),
          "replace each variant with S.TaggedStruct('B', { ... }) and declare type G = S.Schema.Type<typeof G>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeTaggedStruct_WhenErrorShapedMemberHasComputedField',
      code: `
        type C =
          | { readonly _tag: 'E'; readonly ['name']: string }
          | { readonly _tag: 'F' }
      `,
      errors: [
        typeError(
          'C',
          expectedStructFor('C'),
          "replace each variant with S.TaggedStruct('E', { ... }) and declare type C = S.Schema.Type<typeof C>",
        ),
        typeError(
          'C',
          expectedStructFor('C'),
          "replace each variant with S.TaggedStruct('F', { ... }) and declare type C = S.Schema.Type<typeof C>",
        ),
      ],
    },
    {
      name: 'Should_PrescribeDerivation_OnlyForMemberReferencingParam',
      code: `
        type H<T> =
          | { readonly _tag: 'A'; readonly value: string }
          | { readonly _tag: 'B'; readonly other: T }
      `,
      errors: [
        typeError(
          'H',
          expectedStructFor('H'),
          "replace each variant with S.TaggedStruct('A', { ... }) and declare type H = S.Schema.Type<typeof H>",
        ),
        typeError(
          'H',
          'a schema with type H = S.Schema.Type<typeof H> from effect (Schema as S from "effect")',
          'declare the schema (e.g. S.TaggedStruct union) and derive the type with S.Schema.Type<typeof H>',
        ),
      ],
    },
    {
      name: 'Should_PrescribeTaggedStruct_WhenErrorShapedMemberHasMethodNamedField',
      code: `
        type M =
          | { readonly _tag: 'E'; name(): string }
          | { readonly _tag: 'F' }
      `,
      errors: [
        typeError(
          'M',
          expectedStructFor('M'),
          "replace each variant with S.TaggedStruct('E', { ... }) and declare type M = S.Schema.Type<typeof M>",
        ),
        typeError(
          'M',
          expectedStructFor('M'),
          "replace each variant with S.TaggedStruct('F', { ... }) and declare type M = S.Schema.Type<typeof M>",
        ),
      ],
    },
    {
      name: 'Should_Report_WhenOnlyOneUnionMemberAllowlisted',
      code: `
        type Legacy = { readonly _tag: 'Legacy' } | { readonly _tag: 'Modern' }
      `,
      options: [{ allow: ['Legacy'] }],
      errors: [
        typeError(
          'Legacy',
          expectedStructFor('Legacy'),
          "replace each variant with S.TaggedStruct('Modern', { ... }) and declare type Legacy = S.Schema.Type<typeof Legacy>",
        ),
      ],
    },
  ],
})
