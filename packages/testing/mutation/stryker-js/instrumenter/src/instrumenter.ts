import * as Effect from 'effect/Effect'

import { type File } from './file.js'
import { InstrumentError } from './instrument-error.schema.js'
import { type InstrumentResult } from './instrument-result.js'
import { type InstrumenterOptions } from './instrumenter-options.js'
import { toApiMutant } from './mutant.js'
import { createParser } from './parsers/index.js'
import { print } from './printers/index.js'
import { transform } from './transformers/index.js'
import { createMutantCollector } from './transformers/mutant-collector.js'

// Product shell instrumentation: span for instrument operation duration + failure, logs for audit
export const instrument = Effect.fn('Instrumenter.instrument')(function*(
  files: readonly File[],
  options: InstrumenterOptions,
) {
  yield* Effect.annotateCurrentSpan({
    'instrumenter.file.count': files.length,
  })
  yield* Effect.logDebug(`Instrumenting ${files.length} source files with mutants`)
  const collector = createMutantCollector()
  const outFiles: File[] = []
  let mutantCount = 0
  const parse = createParser(options)
  for (const { name, mutate, content } of files) {
    const ast = yield* Effect.tryPromise({
      try: () => parse(content, name),
      catch: (cause) => new InstrumentError({ message: `Failed to parse ${name}`, cause }),
    })
    const warnings = yield* Effect.try({
      try: () =>
        transform(ast, collector, {
          options,
          mutateDescription: toBabelLineNumber(mutate),
        }),
      catch: (cause) => new InstrumentError({ message: `Failed to transform ${name}`, cause }),
    })
    for (const warning of warnings) {
      yield* Effect.logWarning(warning)
    }
    const mutatedContent = yield* Effect.try({
      try: () => print(ast),
      catch: (cause) => new InstrumentError({ message: `Failed to print ${name}`, cause }),
    })
    outFiles.push({
      name,
      mutate,
      content: mutatedContent,
    })
    const nrOfMutantsInFile = collector.length - mutantCount
    mutantCount = collector.length
    yield* Effect.logDebug(`Instrumented ${name} (${nrOfMutantsInFile} mutant(s))`)
    yield* Effect.annotateCurrentSpan({
      'instrumenter.mutants.total': collector.length,
    })
  }
  const mutants = collector.map(toApiMutant)
  yield* Effect.logInfo(`Instrumented ${files.length} source file(s) with ${mutants.length} mutant(s)`)
  yield* Effect.annotateCurrentSpan({
    'instrumenter.mutants.placed': mutants.length,
  })
  return {
    files: outFiles,
    mutants,
  } satisfies InstrumentResult
})

function toBabelLineNumber(
  range: import('@systemfsoftware/stryker-js-plugin-api/core').MutateDescription,
): import('@systemfsoftware/stryker-js-plugin-api/core').MutateDescription {
  if (typeof range === 'boolean') {
    return range
  } else {
    return range.map(({ start, end }) => ({
      start: {
        column: start.column,
        line: start.line + 1,
      },
      end: {
        column: end.column,
        line: end.line + 1,
      },
    }))
  }
}
