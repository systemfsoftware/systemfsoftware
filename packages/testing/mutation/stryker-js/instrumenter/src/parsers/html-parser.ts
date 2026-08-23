import type { Ast as NGAst } from 'angular-html-parser'
import {
  type AstByFormat,
  AstFormat,
  type HtmlAst,
  type HtmlRootNode,
  type ScriptAst,
  type ScriptFormat,
} from '../syntax/index.js'
import { ParseError } from './parse-error.js'
import { type ParserContext } from './parser-context.js'

const TSX_SCRIPT_TYPES = Object.freeze(['tsx', 'text/tsx'])
const TS_SCRIPT_TYPES = Object.freeze(['ts', 'text/typescript', 'typescript'])
const JS_SCRIPT_TYPES = Object.freeze([
  'js',
  'text/javascript',
  'javascript',
  'module',
])

/*
The parser implementation in this file is heavily based on prettier's html parser
https://github.com/prettier/prettier/blob/5a7162d0636a82c5862b9101b845af40918d22d1/src/language-html/parser-html.js
*/
export async function parse(
  text: string,
  originFileName: string,
  context: ParserContext,
): Promise<HtmlAst> {
  const root = await ngHtmlParser(text, originFileName, context)

  return {
    originFileName,
    rawContent: text,
    format: AstFormat.Html,
    root,
  }
}

async function ngHtmlParser(
  text: string,
  fileName: string,
  parserContext: ParserContext,
): Promise<HtmlRootNode> {
  const ngParser = await import('angular-html-parser')

  const { rootNodes, errors } = ngParser.parse(text, {
    canSelfClose: true,
    allowHtmComponentClosingTags: true,
    isTagNameCaseSensitive: true,
  })

  if (errors.length !== 0) {
    const firstError = errors[0]
    if (firstError === undefined) {
      throw new Error('HTML parser reported errors but first error is missing')
    }
    throw new ParseError(
      firstError.msg,
      fileName,
      toSourceLocation(firstError.span.start),
    )
  }
  const scriptsAsPromised: Array<Promise<ScriptAst>> = []
  ngParser.visitAll(
    new (class extends ngParser.RecursiveVisitor {
      public override visitElement(el: NGAst.Element, context: unknown): void {
        const scriptFormat = getScriptType(el)
        if (scriptFormat) {
          scriptsAsPromised.push(parseScript(el, scriptFormat))
        }
        super.visitElement(el, context)
      }
    })(),
    rootNodes,
  )
  const scripts = await Promise.all(scriptsAsPromised)
  const root: HtmlRootNode = {
    scripts,
  }

  return root

  async function parseScript<T extends ScriptFormat>(
    el: NGAst.Element,
    scriptFormat: T,
  ): Promise<AstByFormat[T]> {
    const endSourceSpan = el.endSourceSpan
    if (endSourceSpan === null || endSourceSpan === undefined) {
      throw new Error('HTML element without an end source span')
    }
    const content = text.substring(
      el.startSourceSpan.end.offset,
      endSourceSpan.start.offset,
    )
    const ast = await parserContext.parse(content, fileName, scriptFormat)
    if (ast) {
      const offset = el.startSourceSpan.end
      const rootStart = ast.root.start
      if (rootStart === null || rootStart === undefined) {
        throw new Error('Babel File node without a start offset')
      }
      const rootEnd = ast.root.end
      if (rootEnd === null || rootEnd === undefined) {
        throw new Error('Babel File node without an end offset')
      }
      ast.root.start = rootStart + offset.offset
      ast.root.end = rootEnd + offset.offset
      return {
        ...ast,
        offset: {
          column: offset.offset,
          line: offset.line,
        },
      }
    }
    return ast
  }
}

function toSourceLocation({ line, col }: { line: number; col: number }): {
  line: number
  column: number
} {
  // Offset line with 1, since ngHtmlParser is 0-based
  return { line: line + 1, column: col }
}

function getScriptType(element: NGAst.Element): ScriptFormat | undefined {
  if (element.name === 'script') {
    const containsSrc = element.attrs.some((attr) => attr.name === 'src')
    if (!containsSrc) {
      const type = element.attrs.find((attr) => attr.name === 'type') ??
        element.attrs.find((attr) => attr.name === 'lang')
      if (type) {
        const typeToLower = type.value.toLowerCase()
        if (TSX_SCRIPT_TYPES.includes(typeToLower)) {
          return AstFormat.Tsx
        }
        if (TS_SCRIPT_TYPES.includes(typeToLower)) {
          return AstFormat.TS
        }
        if (JS_SCRIPT_TYPES.includes(typeToLower)) {
          return AstFormat.JS
        }
      } else {
        return AstFormat.JS
      }
    }
  }
  return undefined
}
