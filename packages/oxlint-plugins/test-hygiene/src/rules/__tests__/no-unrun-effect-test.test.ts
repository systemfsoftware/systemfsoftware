import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { noUnrunEffectTest } from '../no-unrun-effect-test.js'

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

const filename = 'src/subject.kernel.ts'

ruleTester.run('no-unrun-effect-test', noUnrunEffectTest, {
  valid: [
    {
      name: 'Should_Pass_When_RunnerIsItEffect',
      filename,
      code: `it.effect('Should_Work_When_Called', () => Effect.gen(function*() { expect(1).toBe(1) }))`,
    },
    {
      name: 'Should_Pass_When_RunnerIsItScoped',
      filename,
      code: `it.scoped('Should_Work_When_Called', () => Effect.gen(function*() { expect(1).toBe(1) }))`,
    },
    {
      name: 'Should_Pass_When_CallbackIsAsyncAndRunsTheEffect',
      filename,
      code: `it('Should_Work_When_Called', async () => { await Effect.runPromise(Effect.succeed(1)) })`,
    },
    {
      name: 'Should_Pass_When_CallbackAssertsSynchronously',
      filename,
      code: `it('Should_Work_When_Called', () => { expect(resolve(1)).toBe(2) })`,
    },
    {
      name: 'Should_Pass_When_ReturnedValueIsAnArrayMap',
      filename,
      code: `it('Should_Work_When_Called', () => rows.map((r) => r.name))`,
    },
    {
      name: 'Should_Pass_When_ReturnedValueIsFromANonEffectModule',
      filename,
      code: `it('Should_Work_When_Called', () => Stream.succeed(1))`,
    },
    {
      name: 'Should_Pass_When_CallbackBodyHasMoreThanOneStatement',
      filename,
      code: `it('Should_Work_When_Called', () => { const e = Effect.succeed(1); expect(e).toBeDefined() })`,
    },
    {
      name: 'Should_Pass_When_EffectModuleIsCalledWithUnknownConstructor',
      filename,
      code: `it('Should_Work_When_Called', () => Effect.unknownMethod(1))`,
    },
    {
      name: 'Should_Pass_When_AsyncArrowReturnsEffect',
      filename,
      code: `it('Should_Work_When_Called', async () => Effect.gen(function*() {}))`,
    },
    {
      name: 'Should_Pass_When_BlockBodyHasZeroStatements',
      filename,
      code: `it('Should_Work_When_Called', () => {})`,
    },
    {
      name: 'Should_Pass_When_ReturnedCallHasBareIdentifierCallee',
      filename,
      code: `it('Should_Work_When_Called', () => someFn(1))`,
    },
    {
      name: 'Should_Pass_When_BlockBodyHasReturnFollowedByMoreStatements',
      filename,
      code: `it('Should_Work_When_Called', () => { return Effect.gen(function*() {}); expect(1).toBe(1) })`,
    },
    {
      name: 'Should_Pass_When_ComputedMemberAccessIsNotAStaticConstructor',
      filename,
      code: `const gen = 'succeed'
it('Should_Work_When_Called', () => Effect[gen](1))`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_BareItReturnsEffectGen',
      filename,
      code: `it('Should_Work_When_Called', () => Effect.gen(function*() { expect(1).toBe(2) }))`,
      errors: [{ messageId: 'unrunEffectTest' }],
    },
    {
      name: 'Should_Report_When_BareTestReturnsEffectGen',
      filename,
      code: `test('Should_Work_When_Called', () => Effect.gen(function*() { expect(1).toBe(2) }))`,
      errors: [{ messageId: 'unrunEffectTest' }],
    },
    {
      name: 'Should_Report_When_ModuleIsAliasedEffectModule',
      filename,
      code: `it('Should_Work_When_Called', () => EffectModule.gen(function*() { expect(1).toBe(2) }))`,
      errors: [{ messageId: 'unrunEffectTest' }],
    },
    {
      name: 'Should_Report_When_EffectIsPipedAfterConstruction',
      filename,
      code: `it('Should_Work_When_Called', () => Effect.gen(function*() {}).pipe(Effect.provide(layer)))`,
      errors: [{ messageId: 'unrunEffectTest' }],
    },
    {
      name: 'Should_Report_When_BlockBodyReturnsTheEffect',
      filename,
      code: `it('Should_Work_When_Called', () => { return Effect.either(pipeline) })`,
      errors: [{ messageId: 'unrunEffectTest' }],
    },
    {
      name: 'Should_Report_When_ConstructorIsSucceed',
      filename,
      code: `it('Should_Work_When_Called', () => Effect.succeed(1))`,
      errors: [{ messageId: 'unrunEffectTest' }],
    },
  ],
})
