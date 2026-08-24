import { AstFormat } from '../syntax/index.js'

import { type AstTransformer } from './index.js'

export const transformHtml: AstTransformer<AstFormat.Html> = (
  { root },
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  root.scripts.forEach((ast) => {
    warnings.push(...context.transform(ast, mutantCollector, context))
  })
  return warnings
}
