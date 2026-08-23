import { notEmpty } from '@systemfsoftware/stryker-js-util'

import { type SvelteAst } from '../syntax/index.js'

import { type Printer } from './index.js'

export const print: Printer<SvelteAst> = ({ root, rawContent }, context) => {
  let currentIndex = 0
  let outputText = ''

  const sortedScripts = [root.moduleScript, ...root.additionalScripts]
    .filter(notEmpty)
    .sort((a, b) => a.range.start - b.range.start)
  for (const script of sortedScripts) {
    if (script.isExpression) {
      const code = context.print(script.ast, context)
      const codeWithoutSemicolon = code.slice(0, -1)
      outputText += rawContent.substring(currentIndex, script.range.start) +
        codeWithoutSemicolon
      currentIndex = script.range.end
    } else {
      outputText += rawContent.substring(currentIndex, script.range.start)
      outputText += '\n'
      outputText += context.print(script.ast, context)
      outputText += '\n'
      currentIndex = script.range.end
    }
  }

  outputText += rawContent.substring(currentIndex)

  return outputText
}
