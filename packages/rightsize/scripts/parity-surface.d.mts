/** Type surface for the generated frozen-surface module (plain .mjs; content is generated data). */
export interface SurfaceSection {
  readonly id: string
  readonly title: string
  readonly file: string
  readonly members: readonly string[]
}
export interface Surface {
  readonly generator: string
  readonly testcontainers: string
  readonly sections: readonly SurfaceSection[]
}
export declare const surface: Surface
