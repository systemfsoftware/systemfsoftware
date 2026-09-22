/**
 * Binary entrypoint for the `api-extractor` CLI.
 *
 * U1 scaffold: this composition root will host `effect/unstable/cli` command
 * dispatch and NodeServices runtime layers in U6. It is intentionally free of
 * side effects so `pnpm api:check` dogfoods the binary cleanly on exit 0.
 */
export const BIN_NAME = 'api-extractor'
