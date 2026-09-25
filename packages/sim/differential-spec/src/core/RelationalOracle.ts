export interface DisparityRecord<Input = unknown> {
  readonly input: Input
  readonly outputA: string
  readonly outputB: string
  readonly trace: string
  readonly reproSnippet: string
}

export type RelationalOracle<OutputA, OutputB> = (
  outputA: OutputA,
  outputB: OutputB,
) => boolean
