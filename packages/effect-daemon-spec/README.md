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
import { LeaderLock } from '@systemfsoftware/effect-daemon-spec'

const myLock = LeaderLock.make({
  key: 'daemon-leader',
  leaseDuration: '5 seconds',
  renewInterval: '1 second',
})
```

## Install

```bash
pnpm add @systemfsoftware/effect-daemon-spec
```

> [!NOTE]
> `effect` is a peer dependency — you bring your own.
