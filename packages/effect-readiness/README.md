# @systemfsoftware/effect-readiness

Composable readiness probes and condition polling for Effect applications, containers, and micro-VMs.

## Installation

```bash
pnpm add @systemfsoftware/effect-readiness
```

## Features

- **Protocol Agnostic**: Wait for TCP port connectivity, HTTP endpoint health (`2xx` responses), or stdout/stderr log stream patterns.
- **Pure Core / Imperative Shell**: Decoupled workflow decisions (`resolveProbe`, `evaluateProbe`) and pure schemas with effectful cell-based execution (`awaitCondition`).
- **Platform Separation**: Pluggable network dialing and stream reading through `HostProber` and `LogSource` Context tags. Built-in `NodeHostProber` using `@effect/platform-node`.
- **Interruption & Resource Safety**: Clean socket disposal with prompt release upon check completion or timeout.

## Usage

```typescript
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer } from 'effect'

const target = Readiness.target([
  { guest: 8080, host: '127.0.0.1', hostPort: 32768 },
], {
  timeoutMs: 10_000,
  pollMs: 100,
})

// Wait for TCP port connectivity
const checkTcp = Readiness.awaitCondition(target, Readiness.Wait.forTcp(8080))

// Wait for HTTP endpoint readiness
const checkHttp = Readiness.awaitCondition(target, Readiness.Wait.forHttp('/healthz', 8080))

// Wait for stdout/stderr log line pattern
const checkLog = Readiness.awaitCondition(target, Readiness.Wait.forLog('server listening on 8080'))

// Execute with built-in Node driver and a provided LogSource
const program = checkHttp.pipe(
  Effect.provide(
    Layer.merge(
      Readiness.NodeHostProber,
      Layer.succeed(Readiness.LogSource, {
        entries: Effect.succeed(['booting', 'server listening on 8080']),
      }),
    ),
  ),
)
```
