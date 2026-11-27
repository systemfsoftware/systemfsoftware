import {
  type AlchemyStack,
  alchemyStack,
  type StackLayerError,
  type StackProgram,
} from '@systemfsoftware/alchemy-stack-layer'
import type { Layer } from 'effect'
import { describe, expect, it } from 'tstyche'

declare const signIn: StackProgram<{ readonly url: string }>
declare const billing: StackProgram<{ readonly url: string }>

const SignInStack = alchemyStack('SignInStack', { deploy: signIn })
const BillingStack = alchemyStack('BillingStack', { deploy: billing })

declare const needsSignIn: Layer.Layer<'RpcClient', never, AlchemyStack<'SignInStack', { readonly url: string }>>

describe('alchemyStack', () => {
  it('Should_ServeTheStackOutputs_When_TheTagIsRead', () => {
    expect<Parameters<typeof SignInStack.of>[0]>().type.toBe<{ readonly url: string }>()
  })

  it('Should_ProvideItsOwnStackWithNoFurtherRequirement_When_ItsLayerIsUsed', () => {
    expect(SignInStack.layer).type.toBe<
      Layer.Layer<AlchemyStack<'SignInStack', { readonly url: string }>, StackLayerError>
    >()
  })

  it('Should_GiveTwoStackNamesTwoRequirements_When_EachIsDeclared', () => {
    expect(BillingStack.layer).type.not.toBeAssignableTo<
      Layer.Layer<AlchemyStack<'SignInStack', { readonly url: string }>, StackLayerError>
    >()
    expect(needsSignIn).type.not.toBeAssignableTo<
      Layer.Layer<'RpcClient', never, AlchemyStack<'BillingStack', { readonly url: string }>>
    >()
  })
})
