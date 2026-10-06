export interface DiagramRunOptions {
  readonly cwd: string
}

export interface DiagramReport {
  readonly exitCode: number
  readonly messages: ReadonlyArray<string>
  readonly workflows: number
  readonly files: number
}
