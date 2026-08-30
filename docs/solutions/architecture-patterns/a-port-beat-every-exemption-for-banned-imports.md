# A Port Beat Every Exemption For Banned Imports

Decision: when a lint ban (host builtins) collides with a capability the host
platform does not expose as a service (resolve a specifier against an
_arbitrary_ project directory), the fix that survived review was a two-package
port — `@systemfsoftware/project-modules` holds the Tag, the one adapter
package holds the host call — plus, for worker IPC, `net` `path` endpoints
instead of `fork`. Everything that was tried and rejected failed for a
structural reason, not a taste reason.

## The matrix that converged

| Attempted route                              | Why it died                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `oxlint-disable` on violating files          | vetoed: a disable is a license, not a fix                                                                          |
| Weaken `no-restricted-imports` per package   | vetoed: weakening the gate to pass the gate (`CHK1` polarity)                                                      |
| Third-party resolver (`import-meta-resolve`) | vetoed: new third-party dependency = automatic fail                                                                |
| `import.meta.resolve` everywhere             | wrong semantics: no parent argument since Node 20, cannot resolve from a _project_ root under pnpm's strict layout |
| Hand-rolled `exports`-map resolver           | vetoed: reimplementing Node resolution is spec drift wearing a helper                                              |
| `process.getBuiltinModule` in feature code   | vetoed: the ban dodged is the ban broken                                                                           |
| Unix socket in a temp dir                    | broken on Windows: `listen({ path })` there is a named pipe (`\\.\pipe\…`), not a filesystem AF_UNIX               |
| `Effect.Cluster` for worker transport        | wrong tool: cluster is sharded entities across runners; a pool of disposable children is one duplex per slot       |

## What shipped

1. **The port**: `ProjectModules` (Context.Service Tag, `{ resolve; import }`
   failing with `ModuleNotFound`) in a dependency-free package;
   `ProjectModulesLive(projectDir)` in an adapter package whose single file
   reaches `process.getBuiltinModule('node:module')`. Because
   `getBuiltinModule` is a runtime call and not an import, the adapter needs
   no lint exemption and the ban holds in every package including its own.
2. **The transport**: parent spawns via `ChildProcess.make(process.execPath, …)`
   (`@effect/platform`'s spawner), passes the endpoint through the
   environment; child binds `NodeSocketServer.layer({ path })`, parent
   connects `NodeSocket.layerNet({ path })` +
   `RpcClient.layerProtocolSocket`; NDJSON both sides (framing included).
   Options travel the worker directory as a JSON file decoded with
   `Schema.fromJsonString` — no initial-message channel exists on socket
   protocols.
3. **The preset**: `no-restricted-imports` regexes for `node:*`, the unprefixed
   builtin list, and `@std/*` modules that mirror platform services.

## Invariants the transport depends on

- The endpoint address is picked by the parent and carried by the environment;
  there is no handshake, so there is no handshake to lose. POSIX uses
  `join(workerDir, "worker.sock")` (the scoped temp dir cleans the file);
  Windows uses a per-spawn `\\.\pipe\…` name seeded with `randomUUID`
  (unguessable ⇒ same-user by default; no shared counter across fibers).
- The child writes nothing the parent waits on: the parent's
  `Layer.build(clientLayer)` fails with a socket error until the child binds,
  and `Effect.retry(connectRetry)` bounds it. `Schedule.min` does NOT bound —
  `min` continues while any branch continues, so `min([spaced, recurs])`
  retries forever. The bounded form is `Schedule.max`.
- `raceFirst(worker.exited, …)` fails the spawn the moment the child dies, so
  a boot-crashed worker surfaces as `ChildProcessCrashedError` immediately
  instead of after the full connect budget; the pool's invalidate path sees
  the same tag it always did.

## Gate

`pnpm check:local` (format + forbidden-lines + turbo lint/typecheck/test/dist
over every package) is the arbiter for the ban's transitivity — a banned
import anywhere in a workspace package fails it. The worker transport's own
probe: boot the built worker entry with `STRYKER_SOCKET` set and connect the
path; the container lane exercises the full parent round-trip.

Related: `an-escape-hatch-is-an-unfalsified-hypothesis.md` (exemptions are
hypotheses; this port is what the falsified claim bought instead),
`../../tooling-decisions/` (dep admission: `import-meta-resolve` was rejected
under the same fail rule that forced the port).
