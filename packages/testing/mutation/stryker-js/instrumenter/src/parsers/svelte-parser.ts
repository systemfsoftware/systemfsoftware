import type { BaseNode, Program } from 'estree'

import * as Predicate from 'effect/Predicate'

import { AstFormat, type SvelteAst, type SvelteRootNode, type TemplateScript } from '../syntax/index.js'
import { computeLineStarts, positionFromOffset } from '../syntax/position-converter.js'

import { type ParserContext } from './parser-context.js'
import { SvelteVersionNotSupported, SvelteWalkerNotFound } from './svelte-parser.schema.js'

interface Range {
  start: number
  end: number
}
interface TemplateRange extends Range {
  isExpression: boolean
}

interface TemplateScriptRange extends TemplateRange {
  format: AstFormat.JS | AstFormat.TS
}

interface ScriptTag {
  content: string
  attributes: Record<string, boolean | string>
}

type RangedProgram = Program & Range

function parseVersion(version: string): { major: number; minor: number } | undefined {
  const match = /^(\d+)\.(\d+)(?:\.\d+)?/.exec(version)
  if (!match) {
    return undefined
  }
  const major = Number.parseInt(match[1] ?? '', 10)
  const minor = Number.parseInt(match[2] ?? '', 10)
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return undefined
  }
  return { major, minor }
}

function isSupportedSvelteVersion(version: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) {
    return false
  }
  return parsed.major > 3 || (parsed.major === 3 && parsed.minor >= 30)
}

function isSvelteV5OrLater(version: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) {
    return false
  }
  return parsed.major >= 5
}

type WalkFn = (
  node: unknown,
  handlers: { enter(node: unknown): void },
) => unknown

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isRangedProgram(value: unknown): value is RangedProgram {
  return (
    isPlainRecord(value) &&
    typeof value['start'] === 'number' &&
    typeof value['end'] === 'number'
  )
}

function isWalkFunction(value: unknown): value is WalkFn {
  return typeof value === 'function'
}

function isRangedBaseNode(value: unknown): value is BaseNode & Range {
  return (
    isPlainRecord(value) &&
    typeof value['type'] === 'string' &&
    typeof value['start'] === 'number' &&
    typeof value['end'] === 'number'
  )
}

function isTemplateExpressionType(type: string): boolean {
  return (
    type === 'MustacheTag' ||
    type === 'RawMustacheTag' ||
    type === 'IfBlock' ||
    type === 'ConstTag' ||
    type === 'EachBlock' ||
    type === 'AwaitBlock' ||
    type === 'KeyBlock' ||
    type === 'EventHandler'
  )
}

function tryGetScriptRangeFromElement(
  node: unknown,
): TemplateRange | undefined {
  if (
    !isPlainRecord(node) ||
    node['type'] !== 'Element' ||
    node['name'] !== 'script'
  ) {
    return undefined
  }
  const children = node['children']
  if (!isUnknownArray(children) || children.length === 0) {
    return undefined
  }
  const firstChild: unknown = children[0]
  if (
    !isPlainRecord(firstChild) ||
    firstChild['type'] !== 'Text' ||
    typeof firstChild['start'] !== 'number' ||
    typeof firstChild['end'] !== 'number'
  ) {
    return undefined
  }
  return {
    start: firstChild['start'],
    end: firstChild['end'],
    isExpression: false,
  }
}

export async function parse(
  text: string,
  fileName: string,
  context: ParserContext,
): Promise<SvelteAst> {
  const {
    parse: svelteParse,
    preprocess,
    VERSION,
  } = await import('svelte/compiler')
  let walk: WalkFn

  if (!isSupportedSvelteVersion(VERSION)) {
    throw new SvelteVersionNotSupported({
      version: VERSION,
      fileName,
      cause: `Expected >=3.30`,
    })
  }
  /*
    Allow instrumentation of Svelte 5 projects without dropping support for Svelte 4.
    Due to the way Svelte 5 is structured, we can no longer use the typings from Svelte 4, even though
    we use the legacy AST. The full Svelte 5 migration should update these typings to use the new AST.
  */
  if (isSvelteV5OrLater(VERSION)) {
    const walkerModule: unknown = await import(
      import.meta.resolve('estree-walker', import.meta.resolve('svelte'))
    )
    if (
      !isPlainRecord(walkerModule) ||
      !isWalkFunction(walkerModule['walk'])
    ) {
      throw new SvelteWalkerNotFound({ fileName, cause: 'estree-walker module without walk export' })
    }
    walk = walkerModule['walk']
  } else {
    // Svelte 4
    const svelteCompilerModule: unknown = await import('svelte/compiler')
    if (
      !isPlainRecord(svelteCompilerModule) ||
      !isWalkFunction(svelteCompilerModule['walk'])
    ) {
      throw new SvelteWalkerNotFound({ fileName, cause: 'svelte/compiler module without walk export' })
    }
    walk = svelteCompilerModule['walk']
  }

  const lineStarts = computeLineStarts(text)
  const { replacedCode, scriptMap } = await replaceScripts(text)
  const svelteAst: unknown = svelteParse(replacedCode, { filename: fileName })

  const moduleScriptRange = getModuleScriptRange(svelteAst)
  const templateRanges = getTemplateScriptRanges(svelteAst, walk)
  const { remappedModuleScriptRange, remappedScriptRanges } = remapScriptLocations(
    replacedCode,
    scriptMap,
    moduleScriptRange,
    templateRanges,
  )

  const [moduleScript, ...additionalScripts] = await Promise.all([
    parseTemplateScriptIfDefined(remappedModuleScriptRange),
    ...remappedScriptRanges.map(parseTemplateScript),
  ])
  const root: SvelteRootNode = {
    ...(moduleScript === undefined ? {} : { moduleScript }),
    additionalScripts,
  }

  return {
    originFileName: fileName,
    rawContent: text,
    format: AstFormat.Svelte,
    root,
  }

  /**
   * Replaces script tags with placeholders.
   * This is needed, because svelte's `parse` doesn't support `lang="ts"`.
   */
  async function replaceScripts(code: string) {
    const map = new Map<string, ScriptTag>()
    let scriptIndex = 0
    const result = await preprocess(code, {
      script(script) {
        const scriptName = `script${scriptIndex++}`
        map.set(scriptName, script)
        return { code: scriptName }
      },
    })
    return { replacedCode: result.code, scriptMap: map }
  }

  function getTemplateScriptRanges(
    ast: unknown,
    walker: WalkFn,
  ): TemplateRange[] {
    const ranges: TemplateRange[] = []

    if (
      isPlainRecord(ast) &&
      ast['instance'] !== null &&
      ast['instance'] !== undefined
    ) {
      const instance = ast['instance']
      if (isPlainRecord(instance) && 'content' in instance) {
        const content = instance['content']
        if (isRangedProgram(content)) {
          ranges.push({
            start: content.start,
            end: content.end,
            isExpression: false,
          })
        } else {
          throw new Error('Svelte instance script without a source range')
        }
      }
    }

    if (!isPlainRecord(ast) || !('html' in ast)) {
      throw new Error('Svelte AST without html')
    }
    const html = ast['html']
    walker(html, {
      enter(node: unknown) {
        const scriptRange = tryGetScriptRangeFromElement(node)
        if (scriptRange) {
          ranges.push(scriptRange)
        }

        const templateExpression = collectTemplateExpression(node)
        if (templateExpression) {
          const { start, end } = templateExpression
          ranges.push({ start, end, isExpression: true })
        }
      },
    })

    return ranges
  }

  async function parseTemplateScriptIfDefined(
    range?: TemplateScriptRange,
  ): Promise<TemplateScript | undefined> {
    if (range) {
      return parseTemplateScript(range)
    }
    return
  }
  async function parseTemplateScript({
    start,
    end,
    isExpression,
    format,
  }: TemplateScriptRange): Promise<TemplateScript> {
    const scriptText = text.slice(start, end)
    const parsed = await context.parse(scriptText, fileName, format)
    return {
      ast: {
        ...parsed,
        offset: positionFromOffset(lineStarts, start),
      },
      range: { start, end },
      isExpression,
    }
  }
}

function getModuleScriptRange(
  svelteAst: unknown,
): TemplateRange | undefined {
  if (
    !isPlainRecord(svelteAst) ||
    !('module' in svelteAst) ||
    svelteAst['module'] === null ||
    svelteAst['module'] === undefined
  ) {
    return
  }
  const mod = svelteAst['module']
  if (!isPlainRecord(mod) || !('content' in mod)) {
    throw new Error('Svelte module script without a source range')
  }
  const content = mod['content']
  if (!isRangedProgram(content)) {
    throw new Error('Svelte module script without a source range')
  }
  return { start: content.start, end: content.end, isExpression: false }
}

/**
 * Remaps script locations back to the original places using the script map
 */
function remapScriptLocations(
  code: string,
  scriptMap: Map<string, ScriptTag>,
  moduleScriptRange: TemplateRange | undefined,
  templateRanges: TemplateRange[],
): {
  remappedModuleScriptRange: TemplateScriptRange | undefined
  remappedScriptRanges: TemplateScriptRange[]
} {
  const scriptRanges = [moduleScriptRange, ...templateRanges]
    .filter(Predicate.isNotNullish)
    .sort((a, b) => a.start - b.start)
  let offset = 0
  let newModuleScriptRange: TemplateScriptRange | undefined
  const newScriptRanges: TemplateScriptRange[] = scriptRanges.map((range) => {
    const script = code.substring(range.start, range.end)
    const actualScript = scriptMap.get(script)
    const start = range.start + offset
    if (actualScript) {
      const scriptRange: TemplateScriptRange = {
        start,
        end: start + actualScript.content.length,
        isExpression: range.isExpression,
        format: actualScript.attributes['lang'] === 'ts' ? AstFormat.TS : AstFormat.JS,
      }
      offset += actualScript.content.length - script.length
      if (range === moduleScriptRange) {
        newModuleScriptRange = scriptRange
      }
      return scriptRange
    } else {
      // Template script is always JS
      return {
        start,
        end: start + script.length,
        isExpression: range.isExpression,
        format: AstFormat.JS,
      }
    }
  })
  return {
    remappedModuleScriptRange: newModuleScriptRange,
    remappedScriptRanges: newScriptRanges.filter(
      (range) => range !== newModuleScriptRange,
    ),
  }
}

function collectTemplateExpression(
  node: unknown,
): (BaseNode & Range) | undefined {
  if (!isPlainRecord(node) || typeof node['type'] !== 'string') {
    return undefined
  }
  if (!isTemplateExpressionType(node['type'])) {
    return undefined
  }
  if (!('expression' in node)) {
    return undefined
  }
  const expression = node['expression']
  if (isRangedBaseNode(expression)) {
    return expression
  }
  return undefined
}
