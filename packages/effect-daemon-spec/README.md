# @systemfsoftware/effect-daemon-spec

Supervise dynamic worker trees in [Effect](https://effect.website) — restart policies, leader election, and health-gated retries built on top of Effect's supervision primitives.

Effect's built-in `Supervisor` tracks fibre lifecycles but doesn't give you daemon semantics. This library fills the gap: exponential backoff on restart, distributed leader election via `Duration`-based fencing, and poll-based health checks that gate restart decisions.

```ts
import { Daemon, RestartPolicy } from '@systemfsoftware/effect-daemon-spec'
import { Effect } from 'effect'

const pool = Daemon.supervised('worker-pool', {
  bootstrap: [worker, worker, worker],
  policy: RestartPolicy.exponential({
    minDelay: '100 millis',
    maxDelay: '10 seconds',
  }),
})

Effect.scoped(pool).pipe(Effect.runFork)
```

A leader-lock coordinator ensures only one node acts as the leader for a given key:

```ts
import { Adapter } from '@systemfsoftware/effect-daemon-spec/LeaderLock'

const myLock = Adapter.LeaderLock
```

## Install

```bash
pnpm add @systemfsoftware/effect-daemon-spec
```

> [!NOTE]
> `effect` is a peer dependency — you bring your own.

## Depth floor: exhibited, not enforced

The doctrine's depth floor — that a declared entry's exposed names stay below
the count of implementation modules it hides — is exhibited by this package's
shape but not enforced by any shipped gate. A per-file linter cannot count the
modules behind an entry, and a repo-local script would enforce a published
concern outside the published artifact (REPO-S6). No shippable carrier exists
for it, so the statement lives here instead of being faked as a rule.

## Subpaths

Beyond the root entry, concept-scoped subpaths are published for the surfaces a
consumer reaches for directly:

- `@systemfsoftware/effect-daemon-spec/SupervisionPolicy`
- `@systemfsoftware/effect-daemon-spec/LeaderLock`
- `@systemfsoftware/effect-daemon-spec/DaemonReporter`
- `@systemfsoftware/effect-daemon-spec/DaemonSpec`

Everything under `./internal/*` is sealed: the executors are implementation
detail and resolve to `ERR_PACKAGE_PATH_NOT_EXPORTED`.
