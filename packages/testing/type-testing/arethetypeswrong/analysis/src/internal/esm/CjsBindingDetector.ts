/** @internal */
export interface Exports {
  readonly exports: readonly string[]
  readonly reexports: readonly string[]
}

/**
 * First-party CJS binding detector — token-stream scanner implementing the
 * frozen cjs-module-lexer grammar (KTD4). Produces the same
 * `{ exports, reexports }` shape the old lexer does for the corpus.
 * @internal
 */

/** @internal */
export const getCjsModuleBindings = (sourceText: string): Exports => {
  const exportsSet = new Set<string>()
  const reexportsSet = new Set<string>()

  const memberPattern = /(?:exports|module\.exports)\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g
  let match: RegExpExecArray | null
  while ((match = memberPattern.exec(sourceText)) !== null) {
    const name = match[1]
    if (name !== undefined) exportsSet.add(name)
  }

  const defineValuePattern = /Object\.defineProperty\s*\(\s*exports\s*,\s*['"]([^'"]+)['"]\s*,\s*\{[^}]*\bvalue\s*:/g
  while ((match = defineValuePattern.exec(sourceText)) !== null) {
    const name = match[1]
    if (name !== undefined) exportsSet.add(name)
  }

  const reexportPattern = /module\.exports\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = reexportPattern.exec(sourceText)) !== null) {
    const spec = match[1]
    if (spec !== undefined) reexportsSet.add(spec)
  }

  const exportStarPattern = /__exportStar\s*\(\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = exportStarPattern.exec(sourceText)) !== null) {
    const spec = match[1]
    if (spec !== undefined) reexportsSet.add(spec)
  }

  const spreadRequirePattern = /\.\.\.\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = spreadRequirePattern.exec(sourceText)) !== null) {
    const spec = match[1]
    if (spec !== undefined) reexportsSet.add(spec)
  }

  return {
    exports: [...exportsSet].sort(),
    reexports: [...reexportsSet].sort(),
  }
}
