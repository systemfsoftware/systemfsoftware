import * as Context from 'effect/Context'

export const TestFile = Context.Reference<string>('@systemfsoftware/effect-spec-runtime/TestFile', {
  defaultValue: () => '',
})
