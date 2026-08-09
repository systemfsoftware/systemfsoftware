---
title: "Testcontainers stops at a dead docker socket instead of falling through to podman"
date: 2026-08-09
category: test-failures
module: stryker-js-cli
problem_type: test_failure
component: testing_framework
symptoms:
  - "`pnpm --filter @systemfsoftware/stryker-js-cli test:contract` dies in Vitest global setup before any test runs"
  - "`Error: the CLI contract lane needs a container runtime, and DOCKER_HOST=<unset> is not reachable`"
  - "testcontainers reports `Could not find a working container runtime strategy` as the cause"
  - "`docker info` fails while `podman run --rm docker.io/library/hello-world` succeeds on the same host"
root_cause: incomplete_setup
resolution_type: test_fix
severity: high
tags: [testcontainers, podman, docker-socket, container-runtime, global-setup, stryker-js-cli, unix-socket, false-diagnosis]
---

# Testcontainers stops at a dead docker socket instead of falling through to podman

## Problem

`pnpm --filter @systemfsoftware/stryker-js-cli test:contract` died in Vitest global setup, before any test ran, on a host that could run containers perfectly well — because runtime discovery trusted a socket _file_ that no daemon was listening on, and never fell through to the podman socket that was actually serving. The lane is part of `pnpm check`, so the whole gate could not go green.

## Symptoms

The run aborted in `global-setup.ts` with this error, whose `cause` was the testcontainers runtime-strategy failure:

```text
Error: the CLI contract lane needs a container runtime, and DOCKER_HOST=<unset> is not reachable
    ... caused by: Could not find a working container runtime strategy
```

The host state that produced it:

```console
$ test -S /var/run/docker.sock && echo present   # socket file exists
present
$ docker info                                    # ...but no daemon behind it
Cannot connect to the Docker daemon
$ systemctl --user is-active podman              # meanwhile podman is serving
active
```

## What Didn't Work

### 1. Accepting the recorded "blocked on the environment" verdict

This was the expensive dead end, and it is the main reason this doc exists. The task tracker carried the item as **blocked**, with this reason: the host kernel `6.12.77-1-MANJARO` has no modules tree on disk (only `6.12.101-1-MANJARO` is present in `/lib/modules`), so `xt_addrtype` cannot load and `dockerd` will not start — "needs a user reboot, not a repo change."

Every fact in that verdict was **true**. `uname -r` really does report `6.12.77-1-MANJARO`, and `/lib/modules` really does contain only `6.12.101-1-MANJARO`. What the verdict lacked was a **causal link** to the failure. Containers never needed `dockerd`:

```console
$ podman run --rm docker.io/library/hello-world
Hello from Docker!
```

Podman worked the entire time the item sat parked awaiting a reboot that would have changed nothing. A true fact had been promoted to a cause, and because each individual claim survived checking, the verdict looked well-grounded.

### 2. Reading a `docker info` failure as "no container runtime available"

`docker info` failing proves only that the _docker daemon_ is down. It says nothing about whether the host can run containers. A live podman was already listening at `$XDG_RUNTIME_DIR/podman/podman.sock`, invisible to a docker-only reading.

### 3. Treating `TESTCONTAINERS_RYUK_DISABLED=true` as a necessary concession

Disabling Ryuk looked like a plausible unlock. It was tested rather than assumed: the lane passes 24/24 **without** it. It was deliberately left out of the fix, because an unnecessary workaround variable is a permanent lie about what the lane requires.

## Solution

The fix landed as `test(stryker-js-cli): find podman when the docker socket is dead`, commit `1e0c8e88d4` — at the time of writing on branch `feat/oxlint-recommended-extends-consumable` and **not yet merged** to the default branch, with no PR open yet. Expect that SHA to change if the branch is rebased or squash-merged; search the commit subject instead of the hash. It changed only `packages/stryker-js/cli/__tests__/global-setup.ts` (43 insertions, 1 deletion).

**Before** — `setup()` called the runtime client with no prior selection, so the only lever was `DOCKER_HOST`, and the error named just that one thing:

```ts
await getContainerRuntimeClient().catch((cause: unknown) => {
  throw new Error(
    `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
      process.env['DOCKER_HOST'] ?? '<unset>'
    } is not reachable`,
    { cause },
  )
})
```

There was no discovery to fix — there was none at all. That is why the diff is almost entirely additions.

**After** — `packages/stryker-js/cli/__tests__/global-setup.ts:39-44` enumerates candidates, and `:46-56` probes one by actually connecting:

```ts
const podmanSockets = (): readonly string[] => {
  const uid = process.getuid?.()
  const runtimeDir = process.env['XDG_RUNTIME_DIR'] ?? (uid === undefined ? undefined : `/run/user/${uid}`)
  const rootless = runtimeDir === undefined ? [] : [join(runtimeDir, 'podman', 'podman.sock')]
  return [...rootless, '/run/podman/podman.sock']
}

const reachable = (socketPath: string): Promise<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = connect(socketPath)
  const settle = (value: boolean): void => {
    socket.destroy()
    resolve(value)
  }
  socket.once('connect', () => settle(true))
  socket.once('error', () => settle(false))
  return promise
}
```

Selection at `:66-75` — an explicit `DOCKER_HOST` wins, then the docker socket, then podman:

```ts
const selectContainerRuntime = async (): Promise<void> => {
  if (process.env['DOCKER_HOST'] !== undefined) return
  if (await reachable(DOCKER_SOCKET)) return
  for (const candidate of podmanSockets()) {
    if (await reachable(candidate)) {
      process.env['DOCKER_HOST'] = `unix://${candidate}`
      return
    }
  }
}
```

`setup()` calls it before the client (`:88`), and the failure now lists every candidate tried (`:89-96`):

```ts
throw new Error(
  `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
    process.env['DOCKER_HOST'] ?? '<unset>'
  } is not reachable - tried ${[DOCKER_SOCKET, ...podmanSockets()].join(', ')}`,
  { cause },
)
```

`reachable` uses `Promise.withResolvers()` rather than the `new Promise((resolve, reject) => …)` executor form. That is an agent-editing convention enforced by the coding-agent harness (`ts-promise-with-resolvers`), not by any gate in this repo — the repo's own `no-new-promise-in-effect` rule governs Effect code and does not fire on a plain async helper. Do not read it as a lint requirement.

**Verified:** the lane passes **24/24** with no environment variables (`env -u DOCKER_HOST -u TESTCONTAINERS_RYUK_DISABLED`), and inside the full gate — `pnpm check`, 256/256 tasks, exit 0.

## Why This Works

For ordered candidate discovery, a stale socket **file is worse than an absent one**. Absence lets discovery continue down the list; a present-but-dead socket looks like an answer, so the search stops at it and never reaches podman. The file's existence and the daemon's liveness are different facts, and only the second one matters.

The fix makes liveness the evidence: `connect()` resolves on `connect` and rejects on `error`, so a corpse file fails the probe and the loop falls through. `existsSync` and `test -S` cannot draw that distinction at all — they answer a question nobody needed answered.

An explicit `DOCKER_HOST` stays authoritative (`:67`): the probe runs, and mutates the environment, only when the operator has expressed no preference. So the lane works unconfigured on either runtime without taking away the override.

## Prevention

1. **A unix socket file is not evidence of a live daemon.** Probe by connecting. Reusable shape:

   ```ts
   const reachable = (socketPath: string): Promise<boolean> => {
     const { promise, resolve } = Promise.withResolvers<boolean>()
     const socket = connect(socketPath)
     const settle = (value: boolean): void => {
       socket.destroy()
       resolve(value)
     }
     socket.once('connect', () => settle(true))
     socket.once('error', () => settle(false))
     return promise
   }
   ```

2. **When discovery walks an ordered candidate list, make the error name every candidate tried** — not just the first, and not just the environment variable. An error that names one lever sends the reader to that lever, which is how this failure got diagnosed as an environment problem.

3. **An inherited "blocked, needs an environment change" verdict is a hypothesis, not a finding.** Falsify it by exercising the alternative before paying its cost. One `podman run --rm docker.io/library/hello-world` would have reopened this item much earlier. Watch specifically for a verdict whose individual facts all check out — that is the shape that survives scrutiny while still being wrong, because the missing piece is the causal link, not a fact.

4. **Do not bake in a workaround variable without testing whether it is needed.** `TESTCONTAINERS_RYUK_DISABLED=true` was measured as unnecessary and excluded. An untested workaround becomes a requirement nobody can later justify removing.

## Related Issues

- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — **contains a verdict this learning falsifies.** Its closing assessment describes this same lane as dying in the container runtime and calls it "environmental rather than a code fault." The failure was a code fault: the missing probe-and-fall-through documented here, on a host whose podman could always have served the lane. Note the earlier report cites a different error string (`failed to create shim`) than the one reproduced here, so the docker daemon was likely in a different state at that time; the falsified claim is the "environmental, not a code fault" verdict, not that specific error. That doc's own subject — a cyclic turbo task graph — is unrelated and stands.
- `docs/solutions/logic-errors/timeout-kills-credited-to-nobody.md` — different mechanism, same failure shape: a wrong diagnosis built from a true-but-irrelevant observation, settled in the end by measurement rather than argument.
- `docs/solutions/performance-issues/turbo-cache-never-warm.md` — same verification-gate territory and the same discipline of proving the instrument's verdict instead of accepting a plausible story.
- No related GitHub issue: searches for `testcontainers podman docker socket`, `testcontainers container runtime strategy`, `stryker contract lane container`, and `DOCKER_HOST socket file testcontainers` (`--state all`) each returned no matches.
