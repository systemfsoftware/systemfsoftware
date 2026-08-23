import babel from '@babel/core'
import type { ParserPlugin } from '@babel/parser'

import { AstFormat, type JSAst } from '../syntax/index.js'

import { type ParserOptions } from './parser-options.js'

const { types, parseAsync } = babel

function isParserPlugin(value: unknown): value is ParserPlugin {
  return typeof value === 'string' || Array.isArray(value)
}

function isParserPluginArray(value: unknown[]): value is ParserPlugin[] {
  return value.every(isParserPlugin)
}

function getParserPlugins(
  override: unknown[] | null,
): ParserPlugin[] {
  if (override === null || override === undefined) {
    return defaultPlugins
  }
  if (isParserPluginArray(override)) {
    return override
  }
  throw new Error('Invalid parser plugins: expected ParserPlugin[]')
}

const defaultPlugins: ParserPlugin[] = [
  'doExpressions',
  'objectRestSpread',
  'classProperties',
  'exportDefaultFrom',
  'exportNamespaceFrom',
  'asyncGenerators',
  'functionBind',
  'functionSent',
  'dynamicImport',
  'numericSeparator',
  'importMeta',
  'optionalCatchBinding',
  'optionalChaining',
  'classPrivateProperties',
  ['pipelineOperator', { proposal: 'minimal' }],
  'nullishCoalescingOperator',
  'bigInt',
  'throwExpressions',
  'logicalAssignment',
  'classPrivateMethods',
  'v8intrinsic',
  'partialApplication',
  ['decorators', { decoratorsBeforeExport: false }],
  'jsx',
]

export function createParser({ plugins: pluginsOverride }: ParserOptions) {
  return async function parse(text: string, fileName: string): Promise<JSAst> {
    const plugins = getParserPlugins(pluginsOverride)
    const ast = await parseAsync(text, {
      parserOpts: {
        plugins: [...plugins],
      },
      filename: fileName,
      sourceType: 'module',
    })
    if (ast === null || ast === undefined) {
      throw new Error(
        `Expected ${fileName} to contain a babel.types.file, but it yielded null`,
      )
    }
    if (types.isProgram(ast)) {
      throw new Error(
        `Expected ${fileName} to contain a babel.types.file, but was a program`,
      )
    }
    return {
      originFileName: fileName,
      rawContent: text,
      format: AstFormat.JS,
      root: ast,
    }
  }
}
