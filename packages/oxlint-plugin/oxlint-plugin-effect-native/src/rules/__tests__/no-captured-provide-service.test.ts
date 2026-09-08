import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noCapturedProvideService } from '../no-captured-provide-service.js'

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

const launderingError = {
  messageId: 'capturedProvideService' as const,
  data: {
    expected: 'let the service ride R to the one provide at the composition root',
    name: 'fs',
  },
}

const prod = (code: string) => ({ code, filename: 'src/feature.ts' })

ruleTester.run('no-captured-provide-service', noCapturedProvideService, {
  valid: [
    prod(`import { Effect } from 'effect'
export const flag = Effect.provideService(T, true)`),
    prod(`import { Effect, Layer } from 'effect'
export const live = Effect.gen(function*() {
  const config = yield* RunConfig
  const base = Layer.build(pluginLayer)
  let buildEffect = base.pipe(Effect.provideService(RunConfig, config))
  const ctx = yield* buildEffect
  return ctx
})`),
    prod(`import { Effect, Layer } from 'effect'
export const live = Effect.gen(function*() {
  const config = yield* RunConfig
  const ctx = yield* Layer.build(pluginLayer).pipe(
    Effect.provideService(RunConfig, config),
  )
  return ctx
})`),
    prod(`export const live = otherNamespace.provideService(T, captured)`),
  ],
  invalid: [
    {
      code: `import { Effect } from 'effect'
export const live = Effect.gen(function*() {
  const fs = yield* Fs
  const drain = (line: string) =>
    Effect.gen(function*() {
      yield* write(line).pipe(Effect.provideService(Fs, fs))
    })
  return drain
})`,
      filename: 'src/feature.ts',
      errors: [launderingError],
    },
    {
      code: `import { Effect } from 'effect'
export const live = Effect.gen(function*() {
  const fs = yield* Fs
  const load = (cwd: string) => Effect.provideService(Fs, fs)(read(cwd))
  return load
})`,
      filename: 'src/feature.ts',
      errors: [launderingError],
    },
    {
      code: `import { Effect } from 'effect'
export const live = Effect.gen(function*() {
  const fs = yield* Fs
  const skip = yield* load(cwd).pipe(Effect.provideService(Fs, fs))
  return skip
})`,
      filename: 'src/feature.ts',
      errors: [launderingError],
    },
  ],
})
