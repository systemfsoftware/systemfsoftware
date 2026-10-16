/**
 * Build-output policy shared by every tsdown config: spread it into
 * `defineConfig({ ...quietBuild, ... })` and build with `tsdown -l warn`.
 */
export declare const quietBuild: {
  readonly logLevel: 'warn'
  readonly suppressWarnings: RegExp[]
}
