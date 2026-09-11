/**
 * Printer — turns the instrumenter's ASTs back into source text. The owned
 * ESTree printer (`./print/index.js`) renders; the script-root offsets that
 * html/svelte slicing needs come from the parsed `range`.
 */
import * as Predicate from 'effect/Predicate'
import { spanOf } from './estree.js'
import { type Hashbang, printProgram } from './print/index.js'
import {
  type Ast,
  type HtmlAst,
  type JSAst,
  type SvelteAst,
  type TemplateScript,
  type TSAst,
  type TsxAst,
} from './Syntax.js'

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

// oxc carries the hashbang on the Program; estree's type does not declare it.
const HASHBANG_FIELDS: Readonly<Record<string, (field: unknown) => boolean>> = {
  type: (field) => field === 'Hashbang',
  value: (field) => typeof field === 'string',
  start: (field) => typeof field === 'number',
}

function isHashbang(value: unknown): value is Hashbang {
  return Predicate.isObject(value) && Object.entries(HASHBANG_FIELDS).every(([key, accepts]) => accepts(value[key]))
}

const hashbangOf = (root: Ast['root']): Hashbang | null => {
  const hashbang: unknown = Reflect.get(root, 'hashbang')
  if (!isHashbang(hashbang)) return null
  return hashbang
}

const jsPrint: Printer<JSAst> = (file) => {
  return printProgram(file.root, { hashbang: hashbangOf(file.root) })
}

const tsPrint: Printer<TSAst | TsxAst> = (file) => {
  return printProgram(file.root, { hashbang: hashbangOf(file.root) })
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

interface SvelteOutput {
  readonly text: string
  readonly cursor: number
}

const sveltePrint: Printer<SvelteAst> = ({ root, rawContent }, context) => {
  const sortedScripts = [root.moduleScript, ...root.additionalScripts]
    .filter(Predicate.isNotNullish)
    .sort((a, b) => a.range.start - b.range.start)
  const written = sortedScripts.reduce(
    (state, script) => appendScript(state, script, rawContent, context),
    { text: '', cursor: 0 },
  )
  return written.text + rawContent.substring(written.cursor)
}

function appendScript(
  state: SvelteOutput,
  script: TemplateScript,
  rawContent: string,
  context: PrinterContext,
): SvelteOutput {
  if (script.isExpression) return appendExpression(state, script, rawContent, context)
  return appendStatement(state, script, rawContent, context)
}

function appendExpression(
  state: SvelteOutput,
  script: TemplateScript,
  rawContent: string,
  context: PrinterContext,
): SvelteOutput {
  const code = context.print(script.ast, context)
  return {
    text: `${state.text}${rawContent.substring(state.cursor, script.range.start)}${code.slice(0, -1)}`,
    cursor: script.range.end,
  }
}

function appendStatement(
  state: SvelteOutput,
  script: TemplateScript,
  rawContent: string,
  context: PrinterContext,
): SvelteOutput {
  const code = context.print(script.ast, context)
  return {
    text: `${state.text}${rawContent.substring(state.cursor, script.range.start)}\n${code}\n`,
    cursor: script.range.end,
  }
}
