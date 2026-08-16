# @systemfsoftware/rightsize

Testcontainers-style container testing in Effect-TS: a complete, owned rebuild
of [rightsize-node](https://github.com/ngriaznov/rightsize-node) (behavioral
source; see `NOTICE`), with two execution backends — Docker Engine over a
unix-socket-only client, and microsandbox microVMs via the `msb` CLI — an
agent-native exec/inspection surface, and a public API at or beyond
testcontainers' surface.

The authoritative design for this package is
`docs/plans/2026-08-16-001-feat-rightsize-effect-port-plan.md` (the port plan):
this README intentionally stays a stub until the port completes.
