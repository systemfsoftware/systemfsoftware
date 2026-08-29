/**
 * Printer — turns the instrumenter's ASTs back into source text. The owned
 * ESTree printer (`./print/index.js`) renders; the script-root offsets that
 * html/svelte slicing needs come from the parsed `range`.
 */
import * as Predicate from 'effect/Predicate'
import { spanOf } from './estree.js'
import { printProgram } from './print/index.js'
import { type Ast, type HtmlAst, type JSAst, type SvelteAst, type TSAst, type TsxAst } from './Syntax.js'

export type Printer<T extends Ast> = (file: T, context: PrinterContext) => string
export interface PrinterContext {
  print: Printer<Ast>
}
export function print(file: Ast): string {
  const context: PrinterContext = { print }
  switch (file.format) {
    case 'js':
      return jsPrint(file, context)
    case 'ts':
      return tsPrint(file, context)
    case 'tsx':
      return tsPrint(file, context)
    case 'html':
      return htmlPrint(file, context)
    case 'svelte':
      return sveltePrint(file, context)
  }
}

const jsPrint: Printer<JSAst> = (file) => {
  return printProgram(file.root)
}

const tsPrint: Printer<TSAst | TsxAst> = (file) => {
  return printProgram(file.root)
}

function getScriptStart(script: HtmlAst['root']['scripts'][number]): number {
  const span = spanOf(script.root)
  if (span === undefined) {
    throw new Error('Script AST root without start')
  }
  return span.start
}

function getScriptEnd(script: HtmlAst['root']['scripts'][number]): number {
  const span = spanOf(script.root)
  if (span === undefined) {
    throw new Error('Script AST root without end')
  }
  return span.end
}

const htmlPrint: Printer<HtmlAst> = (ast, context) => {
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

const sveltePrint: Printer<SvelteAst> = ({ root, rawContent }, context) => {
  let currentIndex = 0
  let outputText = ''

  const sortedScripts = [root.moduleScript, ...root.additionalScripts]
    .filter(Predicate.isNotNullish)
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
