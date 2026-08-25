import { type MutateDescription } from '@systemfsoftware/stryker-js-plugin-api/core'

import { type Ast, type AstByFormat, AstFormat } from '../syntax/index.js'

import { transformBabel } from './babel-transformer.js'
import { transformHtml } from './html-transformer.js'
import type { MutantCollector } from './mutant-collector.js'
import { transformSvelte } from './svelte-transformer.js'
import { type TransformerOptions } from './transformer-options.js'

export function transform(
  ast: Ast,
  mutantCollector: MutantCollector,
  transformerContext: Omit<TransformerContext, 'transform'>,
): readonly string[] {
  const context: TransformerContext = {
    ...transformerContext,
    transform,
  }
  switch (ast.format) {
    case AstFormat.Html:
      return transformHtml(ast, mutantCollector, context)
    case AstFormat.JS:
    case AstFormat.TS:
    case AstFormat.Tsx:
      return transformBabel(ast, mutantCollector, context)
    case AstFormat.Svelte:
      return transformSvelte(ast, mutantCollector, context)
  }
}

export type AstTransformer<T extends AstFormat> = (
  ast: AstByFormat[T],
  mutantCollector: MutantCollector,
  context: TransformerContext,
) => readonly string[]

export interface TransformerContext {
  transform: AstTransformer<AstFormat>
  options: TransformerOptions
  mutateDescription: MutateDescription
}
