/**
 * Printer — turns the instrumenter's ASTs back into source text.
 */
import generator from '@babel/generator'
import * as Predicate from 'effect/Predicate'
import { type Ast, type HtmlAst, type JSAst, type SvelteAst, type TSAst, type TsxAst } from './Syntax.js'

/**
 * `@babel/generator` is CommonJS. Under Node's own ESM interop a default import
 * of it is the module's `exports` object, so the code generator sits behind
 * `.default` — the shape upstream reaches for, because upstream ships one
 * emitted file per source file. This package ships a bundle, where the default
 * import is already the function and `.default` is `undefined`, which fails at
 * the first mutant with `generator is not a function` rather than at build
 * time. Resolving both shapes once keeps the printers and the mutant's
 * replacement code identical under either layout.
 */
function resolveGenerate() {
  if (typeof generator === 'function') {
    return generator
  }
  return generator.default
}
export const generate = resolveGenerate()

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
  return generate(file.root, { sourceMaps: false }).code
}

const tsPrint: Printer<TSAst | TsxAst> = (file) => {
  return generate(file.root, {
    decoratorsBeforeExport: true,
    sourceMaps: false,
  }).code
}

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
