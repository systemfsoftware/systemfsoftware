import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  PROMISE_WRAPPER_ACTUAL,
  PROMISE_WRAPPER_EXPECTED,
  PROMISE_WRAPPER_FIX,
} from '../entrypoint-no-promise-wrapper.config.js'
import { entrypointNoPromiseWrapper } from '../entrypoint-no-promise-wrapper.js'

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

const wrapped = (name: string) => ({
  name,
  expected: PROMISE_WRAPPER_EXPECTED,
  actual: PROMISE_WRAPPER_ACTUAL,
  fix: PROMISE_WRAPPER_FIX,
})

ruleTester.run('entrypoint-no-promise-wrapper', entrypointNoPromiseWrapper, {
  valid: [
    {
      name: 'Should_Pass_When_RunMainInterpretsTheProgram',
      code: `runMain(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_RunMainLaunchesTheApplicationLayer',
      code: `NodeRuntime.runMain(Layer.launch(HttpLive))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_RunMainIsCalledWithoutArguments',
      code: `runMain()`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_ThePromiseIsNeverHandedToRunMain',
      code: `const served = Effect.tryPromise(() => server.serve())`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_RunMainIsReachedThroughComputedAccess',
      code: `platform[runMain](Effect.tryPromise(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheArgumentIsABareFunctionCall',
      code: `runMain(tryPromise(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheArgumentCallsANestedNamespace',
      code: `runMain(lib.Effect.tryPromise(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheArgumentCallsAPrivateMethod',
      code: `class Boot {
  #tryPromise() {}
  start() {
    runMain(this.#tryPromise())
  }
}`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheArgumentIsANonPromiseEffectConstructor',
      code: `runMain(Effect.sync(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheArgumentIsAComputedEffectMember',
      code: `runMain(Effect[tryPromise](() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_ABareNonRunMainFunctionReceivesThePromise',
      code: `start(Effect.tryPromise(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_ARuntimeMethodReceivesThePromise',
      code: `const settled = runtime.runPromise(Effect.tryPromise(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheCalleeIsNotAPlainReference',
      code: `(getRunner())(Effect.tryPromise(() => server.serve()))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheCalleeIsAPrivateMethodNamedRunMain',
      code: `class Boot {
  #runMain() {}
  start() {
    this.#runMain(Effect.tryPromise(() => server.serve()))
  }
}`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_TheArgumentIsAPrivateMemberOfEffect',
      code: `class Boot {
  #promise() {}
  start() {
    runMain(Effect.#promise())
  }
}`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_FileIsNotAnEntrypoint',
      code: `runMain(Effect.tryPromise(() => server.serve()))`,
      filename: 'boot.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_RunMainWrapsATryPromise',
      code: `runMain(Effect.tryPromise(() => server.serve()))`,
      filename: 'main.ts',
      errors: [{ messageId: 'promiseWrapper', data: wrapped('Effect.tryPromise') }],
    },
    {
      name: 'Should_Report_When_PlatformRunMainWrapsAPromise',
      code: `BunRuntime.runMain(Effect.promise(() => server.serve()))`,
      filename: 'src/main.ts',
      errors: [{ messageId: 'promiseWrapper', data: wrapped('Effect.promise') }],
    },
  ],
})
