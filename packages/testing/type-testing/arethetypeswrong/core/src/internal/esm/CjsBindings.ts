import type { Exports } from 'cjs-module-lexer'
import { parse as cjsParse } from 'cjs-module-lexer'

/** @internal */
export function getCjsModuleBindings(sourceText: string): Exports {
  return cjsParse(sourceText)
}
