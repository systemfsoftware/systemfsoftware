import { createRuleTester } from './_tester.js'

import { noManualTagMember } from '../no-manual-tag-member.js'

const ruleTester = createRuleTester()

const actual = 'a _tag property signature in a type position'
const expectedTaggedStruct =
  'S.TaggedStruct, deriving the type with S.Schema.Type, from effect (Schema as S from "effect")'
const expectedTaggedError = 'S.TaggedError from effect (Schema as S from "effect")'
const fix =
  'Inherit the member from a tag carrier (interface X extends XTag) or derive it (type X = S.Schema.Type<typeof XBase> & { ... }); keep hand-written only the members no schema can express, or delete the type when it defends nothing'

const forbidden = (name: string, expected: string) => ({
  messageId: 'forbidden' as const,
  data: {
    name,
    expected,
    actual,
    fix,
  },
})

ruleTester.run('no-manual-tag-member', noManualTagMember, {
  valid: [
    {
      name: 'Should_Allow_Tag_Inherited_From_TagCarrier_When_Interface_Extends_It',
      code: `
        interface Initial<A, E> extends Proto<A, E>, InitialTag {}
      `,
    },
    {
      name: 'Should_Allow_Tag_Derived_From_Schema_When_Type_Uses_Schema_Type',
      code: `
        type Binary = S.Schema.Type<typeof BinaryBase> & { readonly left: Expr }
      `,
    },
    {
      name: 'Should_Allow_Tag_In_Object_Expression_When_It_Is_Value_Space',
      code: `
        const step = { _tag: 'Step', model, run }
      `,
    },
    {
      name: 'Should_Allow_Tag_PropertyDefinition_When_It_Lives_In_A_Class',
      code: `
        class MyEvent { _tag = 'MyEvent' }
      `,
    },
    {
      name: 'Should_Allow_Tag_As_Literal_TypeArgument_When_It_Is_Not_A_Property',
      code: `
        type Bare = Omit<Full, '_tag'>
      `,
    },
    {
      name: 'Should_Allow_MethodNamed_Tag_When_It_Is_A_MethodSignature',
      code: `
        interface I { _tag(): void }
      `,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Both_Union_Members_When_TypeAlias_HandWrites_Tag',
      code: `
        type Route = { readonly _tag: 'Reachable'; readonly statusCode: number } | { readonly _tag: 'Unavailable' }
      `,
      errors: [
        forbidden('Route with a hand-written _tag member', expectedTaggedStruct),
        // The second variant has no sibling members: an empty sibling set is
        // not an error shape, so it must NOT get the TaggedError wording.
        forbidden('Route with a hand-written _tag member', expectedTaggedStruct),
      ],
    },
    {
      name: 'Should_Expect_TaggedError_When_Interface_Tag_Has_Only_Error_Sibling',
      code: `
        interface Err { readonly _tag: 'Err'; readonly message: string }
      `,
      errors: [forbidden('Err with a hand-written _tag member', expectedTaggedError)],
    },
    {
      name: 'Should_Report_Open_String_Tag_When_Type_Is_Not_A_Literal',
      code: `
        type Open = { readonly _tag: string }
      `,
      errors: [forbidden('Open with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Report_Union_Type_Tag_When_Value_Is_A_Union',
      code: `
        type Multi = { readonly _tag: 'A' | 'B' }
      `,
      errors: [forbidden('Multi with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Report_Const_Referenced_Tag_When_Type_Is_A_TypeQuery',
      code: `
        type Ref = { readonly _tag: typeof STEP_TAG }
      `,
      errors: [forbidden('Ref with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Name_The_Variable_When_Tag_Lives_In_Arrow_Return_Type',
      code: `
        const f = (o: O): { _tag: 'Stream'; stream: S } => o
      `,
      errors: [forbidden('f with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Report_In_Tst_Fixture_When_There_Is_No_Filename_Gate',
      code: `
        interface Cmd { readonly _tag: 'Cmd' }
      `,
      filename: 'cmd.tst.ts',
      errors: [forbidden('Cmd with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Report_StringLiteral_Key_When_Key_Written_Quoted',
      code: `
        type K = { readonly '_tag': 'K' }
      `,
      errors: [forbidden('K with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Report_Optional_Member_When_Tag_Is_Optional',
      code: `
        type Opt = { _tag?: 'Opt' }
      `,
      errors: [forbidden('Opt with a hand-written _tag member', expectedTaggedStruct)],
    },
    {
      name: 'Should_Use_Anonymous_Name_When_No_Named_Ancestor_Binding_Exists',
      code: `
        consume<{ _tag: 'A' }>()
      `,
      errors: [
        forbidden('an anonymous type literal with a hand-written _tag member', expectedTaggedStruct),
      ],
    },
  ],
})
