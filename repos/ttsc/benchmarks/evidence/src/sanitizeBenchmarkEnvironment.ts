/**
 * Removes runtime-only state inherited from the benchmark launch process.
 *
 * `ttsx` deliberately preloads its TypeScript runtime hook into every child
 * through `NODE_OPTIONS`. The measured coding agent is an independent process,
 * not a worker of the benchmark command, so inheriting that hook makes commands
 * inside the generated workspace resolve through the benchmark repository.
 */
export const sanitizeBenchmarkEnvironment = (
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...source };
  const remove = (names: readonly string[]): void => {
    const selected = new Set(names.map((name) => name.toUpperCase()));
    for (const name of Object.keys(environment))
      if (selected.has(name.toUpperCase())) delete environment[name];
  };

  remove(["EVIDENCE_BENCHMARK_ARCHIVE"]);
  if (
    Object.keys(environment).some(
      (name) => name.toUpperCase() === "TTSX_RUNTIME_MANIFEST",
    )
  )
    remove(["NODE_OPTIONS", "TTSC_TSGO_BINARY", "TTSX_RUNTIME_MANIFEST"]);
  return environment;
};
