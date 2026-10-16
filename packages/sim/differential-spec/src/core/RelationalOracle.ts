export type RelationalOracle<OutputA, OutputB> = (
  outputA: OutputA,
  outputB: OutputB,
) => boolean
