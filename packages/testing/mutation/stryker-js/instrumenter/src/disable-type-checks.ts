import type { types } from '@babel/core'
import * as Predicate from 'effect/Predicate'

import { type File } from './file.js'

import { createParser, getFormat, type ParserOptions } from './parsers/index.js'
import { AstFormat, type HtmlAst, type ScriptAst, type SvelteAst } from './syntax/index.js'

const commentDirectiveRegEx = /^(\s*)@(ts-[a-z-]+).*$/
const tsDirectiveLikeRegEx = /@(ts-[a-z-]+)/
const startingCommentRegex = /(^\s*\/\*.*?\*\/)/gs

/**
 * Disables TypeScript type checking for a single file by inserting `// @ts-nocheck` commands.
 * It also does this for *.js files, as they can be type checked by typescript as well.
 * Other file types are silently ignored
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#-ts-nocheck-in-typescript-files
 */
export async function disableTypeChecks(
  file: File,
  options: ParserOptions,
): Promise<File> {
  const format = getFormat(file.name)
  if (!format) {
    // Readme files and stuff don't need disabling.
    return file
  }
  if (isJSFileWithoutTSDirectives(file, format)) {
    // Performance optimization. Only parse the file when it has a chance of containing a `// @ts-` directive
    return {
      ...file,
      content: prefixWithNoCheck(file.content),
    }
  }

  const parse = createParser(options)
  const ast = await parse(file.content, file.name)
  switch (ast.format) {
    case AstFormat.JS:
    case AstFormat.TS:
    case AstFormat.Tsx:
      return { ...file, content: disableTypeCheckingInBabelAst(ast) }
    case AstFormat.Html:
      return { ...file, content: disableTypeCheckingInHtml(ast) }
    case AstFormat.Svelte:
      return { ...file, content: disableTypeCheckingInSvelte(ast) }
  }
}

function isJSFileWithoutTSDirectives(file: File, format: AstFormat) {
  return (
    (format === AstFormat.TS || format === AstFormat.JS) &&
    !tsDirectiveLikeRegEx.test(file.content)
  )
}

function disableTypeCheckingInBabelAst(ast: ScriptAst): string {
  return prefixWithNoCheck(
    removeTSDirectives(ast.rawContent, ast.root.comments),
  )
}

function prefixWithNoCheck(code: string): string {
  if (code.startsWith('#')) {
    // first line has a shebang (#!/usr/bin/env node)
    const newLineIndex = code.indexOf('\n')
    if (newLineIndex > 0) {
      return `${code.substring(0, newLineIndex)}\n// @ts-nocheck\n${code.substring(newLineIndex + 1)}`
    } else {
      return code
    }
  } else {
    // We should leave comments, like `/** @jest-env jsdom */ at the top of the file, see #2569
    startingCommentRegex.lastIndex = 0
    const commentMatch = startingCommentRegex.exec(code)
    const leadingComment = commentMatch?.[1]
    if (leadingComment === undefined) {
      return `// @ts-nocheck\n${code}`
    }
    return `${leadingComment.concat('\n')}// @ts-nocheck\n${code.substring(leadingComment.length)}`
  }
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

function disableTypeCheckingInHtml(ast: HtmlAst): string {
  const sortedScripts = [...ast.root.scripts].sort(
    (a, b) => getScriptStart(a) - getScriptStart(b),
  )
  let currentIndex = 0
  let html = ''
  for (const script of sortedScripts) {
    html += ast.rawContent.substring(currentIndex, getScriptStart(script))
    html += '\n'
    html += prefixWithNoCheck(
      removeTSDirectives(script.rawContent, script.root.comments),
    )
    html += '\n'
    currentIndex = getScriptEnd(script)
  }
  html += ast.rawContent.substring(currentIndex)
  return html
}

function disableTypeCheckingInSvelte(ast: SvelteAst): string {
  const sortedScripts = [ast.root.moduleScript, ...ast.root.additionalScripts]
    .filter(Predicate.isNotNullish)
    .sort((a, b) => a.range.start - b.range.start)
  let currentIndex = 0
  let html = ''
  for (const script of sortedScripts) {
    html += ast.rawContent.substring(currentIndex, script.range.start)
    html += '\n'
    html += prefixWithNoCheck(
      removeTSDirectives(script.ast.rawContent, script.ast.root.comments),
    )
    html += '\n'
    currentIndex = script.range.end
  }
  html += ast.rawContent.substring(currentIndex)
  return html
}

function removeTSDirectives(
  text: string,
  comments: Array<types.CommentBlock | types.CommentLine> | null | undefined,
): string {
  const directiveRanges = comments
    ?.map(tryParseTSDirective)
    .filter(Predicate.isNotNullish)
    .sort((a, b) => a.startPos - b.startPos)
  if (directiveRanges) {
    let currentIndex = 0
    let pruned = ''
    for (const directiveRange of directiveRanges) {
      pruned += text.substring(currentIndex, directiveRange.startPos)
      currentIndex = directiveRange.endPos
    }
    pruned += text.substring(currentIndex)
    return pruned
  } else {
    return text
  }
}

function tryParseTSDirective(
  comment: types.CommentBlock | types.CommentLine,
): { startPos: number; endPos: number } | undefined {
  const match = commentDirectiveRegEx.exec(comment.value)
  if (match) {
    const start = comment.start
    if (start === undefined || start === null) {
      throw new Error('Comment without start')
    }
    const directivePrefix = match[1]
    if (directivePrefix === undefined) {
      throw new Error('TS directive match without prefix')
    }
    const directiveName = match[2]
    if (directiveName === undefined) {
      throw new Error('TS directive match without directive name')
    }
    const directiveStartPos = start + directivePrefix.length + 2 // +2 to account for the `//` or `/*` start character
    return {
      startPos: directiveStartPos,
      endPos: directiveStartPos + directiveName.length + 1,
    }
  }
  return undefined
}
