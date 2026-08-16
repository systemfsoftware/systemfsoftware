/**
 * `@systemfsoftware/rightsize` — testcontainers-style container testing in
 * Effect-TS with two execution backends (Docker Engine over a unix socket;
 * microsandbox microVMs via the `msb` CLI).
 *
 * U1 scaffold: the public surface of this entry is intentionally empty. The
 * domain schemas, runtime contracts, workflows, backends and the agent-native
 * surface land in later units; the exports partitioning (this entry plus
 * `./modules`, `./backend-docker`, `./backend-msb`) is fixed now and the
 * internal tree stays sealed from it (KTD10).
 *
 * @since 0.1.0
 */
export {}
