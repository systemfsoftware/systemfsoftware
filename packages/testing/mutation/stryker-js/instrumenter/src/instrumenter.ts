import path from 'path'

import { type MutateDescription } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'

import { type File } from './file.js'
import { type InstrumentResult } from './instrument-result.js'
import { type InstrumenterOptions } from './instrumenter-options.js'
import { createParser } from './parsers/index.js'
import { print } from './printers/index.js'
import { MutantCollector, transform } from './transformers/index.js'

/**
 * The instrumenter is responsible for
 * * Generating mutants based on source files
 * * Instrumenting the source code with the mutants placed in `mutant switches`.
 * * Adding mutant coverage expressions in the source code.
 * @see https://github.com/stryker-mutator/stryker-js/issues/1514
 */
export class Instrumenter {
  constructor(private readonly logger: Logger) {}

  public async instrument(files: readonly File[], options: InstrumenterOptions): Promise<InstrumentResult> {
    this.logger.debug('Instrumenting %d source files with mutants', files.length)
    const mutantCollector = new MutantCollector()
    const outFiles: File[] = []
    let mutantCount = 0
    const parse = createParser(options)
    for (const { name, mutate, content } of files) {
      const ast = await parse(content, name)
      transform(ast, mutantCollector, {
        options,
        mutateDescription: toBabelLineNumber(mutate),
        logger: this.logger,
      })
      const mutatedContent = print(ast)
      outFiles.push({
        name,
        mutate,
        content: mutatedContent,
      })
      if (this.logger.isDebugEnabled()) {
        const nrOfMutantsInFile = mutantCollector.mutants.length - mutantCount
        mutantCount = mutantCollector.mutants.length
        this.logger.debug(`Instrumented ${path.relative(process.cwd(), name)} (${nrOfMutantsInFile} mutant(s))`)
      }
    }
    const mutants = mutantCollector.mutants.map((mutant) => mutant.toApiMutant())
    this.logger.info('Instrumented %d source file(s) with %d mutant(s)', files.length, mutants.length)
    return {
      files: outFiles,
      mutants,
    }
  }
}

function toBabelLineNumber(range: MutateDescription): MutateDescription {
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
