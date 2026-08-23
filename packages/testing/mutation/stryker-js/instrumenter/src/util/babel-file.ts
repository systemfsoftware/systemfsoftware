import { File, type types } from '@babel/core'

/**
 * `@babel/core` exports its `File` class at runtime, but `@types/babel__core`
 * omits it. The declaration lives in this module rather than an ambient
 * `.d.ts` so it travels with the sources: a consumer that compiles this
 * package from source (the workspace's `@systemfsoftware/source` condition,
 * and api-extractor with it) reaches the augmentation through the import
 * graph, which an unreferenced ambient file never joins.
 */
declare module '@babel/core' {
  export class File {
    constructor(
      options: { filename?: string },
      input: { code: string; ast: types.File; inputMap?: unknown },
    )
    public ast: types.File
  }
}

/**
 * Wraps a parsed AST the way Babel's own pipeline does, so
 * `NodePath#buildCodeFrameError` can render a code frame
 * (https://github.com/babel/babel/issues/11889). Without the wrapper a
 * placement failure reports no source context.
 */
export function createBabelFile(
  filename: string,
  code: string,
  ast: types.File,
): File {
  return new File({ filename }, { code, ast })
}
