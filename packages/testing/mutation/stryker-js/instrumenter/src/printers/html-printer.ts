import { type HtmlAst } from '../syntax/index.js'

import { type Printer } from './index.js'

function getScriptStart(script: HtmlAst['root']['scripts'][number]): number {
  const start = script.root.start
  if (start === undefined || start === null) {
    throw new Error('Script AST root without start')
  }
  return start
}

function getScriptEnd(script: HtmlAst['root']['scripts'][number]): number {
  const end = script.root.end
  if (end === undefined || end === null) {
    throw new Error('Script AST root without end')
  }
  return end
}

export const print: Printer<HtmlAst> = (ast, context) => {
  const sortedScripts = [...ast.root.scripts].sort(
    (a, b) => getScriptStart(a) - getScriptStart(b),
  )
  let currentIndex = 0
  let html = ''
  for (const script of sortedScripts) {
    html += ast.rawContent.substring(currentIndex, getScriptStart(script))
    html += '\n'
    html += context.print(script, context)
    html += '\n'
    currentIndex = getScriptEnd(script)
  }
  html += ast.rawContent.substr(currentIndex)
  return html
}
