# @systemfsoftware/effect-microsandbox

Effect-native integration-test containers backed by hardware-isolated microVMs. You declare the container as pure data, the library acquires it inside an Effect `Scope`, and teardown is the handle's release — no Docker daemon, no `beforeAll`/`afterAll`, no orphaned guests.

Built on the [`microsandbox`](https://github.com/superradcompany/microsandbox) napi SDK, which bundles the `msb` runtime and libkrunfw per platform. Every microVM runs on real virtualization: KVM on Linux, Hypervisor.framework on Apple Silicon, WHP on Windows. If the host has none, startup fails fast with a typed error that names the fix.

## Quick Start

```bash
pnpm add @systemfsoftware/effect-microsandbox
```

```ts
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, pipe } from 'effect'

const alpine = pipe(
  MicroVM.spec('alpine:3.20'),
  MicroVM.withExposedPorts([6379]),
  MicroVM.withWaitStrategy(MicroVM.Wait.forPort(6379)),
)

const program = Effect.scoped(
  Effect.gen(function*() {
    const vm = yield* alpine.scoped
    const out = yield* MicroVM.exec(vm, 'echo', ['hello'])
    console.log(out.stdout) // hello
    const hostPort = yield* MicroVM.port(vm, 6379)
    console.log(hostPort) // <free 127.0.0.1 port>
  }),
)

NodeRuntime.runMain(Effect.provide(program, Layer.merge(nodeServicesLayer, Readiness.NodeHostProber.layer)))
```

When the scope closes — normally or through interruption — the sandbox is stopped, killed if the stop fails, destroyed, and its record removed. There is nothing to clean up by hand.

## Architecture

### Why MicroVMs

Shared-kernel containers leak state between tests and require a local Docker socket. Process-level fakes drift from real service semantics. A microVM gives each test an isolated hardware kernel with container-like ergonomics: standard image references, port publishing, and execution boundaries governed entirely by an Effect `Scope`.

### Layer & Scoped Execution

A configured container resource (`MicroVM.spec(...)`) directly exposes `.scoped` (to acquire inside an `Effect.scoped` block), `.layer` (to provide as a testcontainer `Layer`), and `.bind(key)` (to provide the live handle under your own `Context` tag). In accordance with `compound-packs/cell-architecture`, platform dependencies (`Crypto`, `FileSystem`, and the readiness `HostProber`) propagate to `R` — `.scoped` and `MicroVM.run` carry them in the effect's requirements, and `.layer` carries them in the layer's input requirements — and are satisfied once at your application or test composition root (such as `@effect/platform-node/NodeServices` plus `Readiness.NodeHostProber.layer`).

## Specifying Containers

Containers are configured through dual-only combinators over the resource. You start with a mandatory image identity via `MicroVM.spec(image)` and apply options through the resource's `pipe` before executing:

```ts
import { pipe } from 'effect'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'

const redis = pipe(
  MicroVM.spec('redis:7-alpine'),
  MicroVM.withExposedPorts([6379]),
  MicroVM.withMemoryLimit(512),
  MicroVM.withWaitStrategy(MicroVM.Wait.forPort(6379)),
)

// Acquire dynamically in a test scope:
const vm = yield* redis.scoped

// Or provide as a Layer (its input asks for the readiness prober):
const RedisLive = Layer.provide(redis.layer, Readiness.NodeHostProber.layer)
```

### Spec Combinators

Every option is one dual over the resource: apply it data-first (`MicroVM.withEnv(vm, env)`) or piped (`pipe(vm, MicroVM.withEnv(env))`). A variant that cannot honor an option refuses it at compile time.

| Dual                              | Description                                   | Applies to     |
| --------------------------------- | --------------------------------------------- | -------------- |
| `MicroVM.withEnv(env)`            | Merges environment variables                  | services, jobs |
| `MicroVM.withExposedPorts(ports)` | Replaces exposed guest ports                  | services only  |
| `MicroVM.withMount(mount)`        | Appends a host bind mount                     | services, jobs |
| `MicroVM.withMemoryLimit(mb)`     | Sets memory limit in MiB                      | services, jobs |
| `MicroVM.withWaitStrategy(s)`     | Sets readiness wait strategy                  | services only  |
| `MicroVM.withHostAccess(enabled)` | Lets a job reach host services                | jobs only      |
| `MicroVM.withWorkdir(path)`       | Sets the working directory of a job's command | jobs only      |

### Readiness Strategies

VM startup does not complete until the specified wait strategy passes (30-second budget before raising `WaitTimeoutError`):

- **Port Probe**: `MicroVM.Wait.forPort(guestPort)` dials the mapped host loopback port.
- **HTTP Probe**: `MicroVM.Wait.forHttp(path, guestPort)` issues a `GET` request and checks for a `2xx` status.
- **Log Pattern**: `MicroVM.Wait.forLog(pattern)` polls the guest log stream for a matching regex.

## One-shot Jobs

`MicroVM.job(image, cmd)` declares a VM whose only purpose is to run `cmd` once. `MicroVM.run` boots the VM, runs the command as the image's default workload, waits for it to end, and returns how it ended. The VM is torn down when the enclosing scope closes, whether the job succeeded, failed, or was interrupted.

```ts
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, Match, pipe } from 'effect'

const probe = pipe(
  MicroVM.job('alpine:3.20', ['wget', '-T', '5', '-qO-', 'http://host.microsandbox.internal:4318/health']),
  MicroVM.withHostAccess(true),
  MicroVM.withWorkdir('/tmp'),
)

const program = Effect.scoped(
  Effect.gen(function*() {
    const completion = yield* MicroVM.run(probe)
    const verdict = Match.value(completion.status).pipe(
      Match.tag('JobExited', ({ code }) => `exited with ${code}`),
      Match.tag('JobSignaled', () => 'killed by a signal'),
      Match.exhaustive,
    )
    console.log(verdict, new TextDecoder().decode(completion.stdout))
  }),
)

NodeRuntime.runMain(Effect.provide(program, Layer.merge(nodeServicesLayer, Readiness.NodeHostProber.layer)))
```

A `JobCompletion` holds:

- `status`: `JobExited` with the exit code, or `JobSignaled` when a signal ended the workload. A non-zero exit code is a successful `.run`; judging it is up to you. `JobSignaled` carries no signal number, because the runtime reports every signal death the same way.
- `stdout` and `stderr`: the complete output as bytes (`Uint8Array`), exactly as the workload wrote it. `MicroVM.run` holds all of it in memory until the workload ends.

`MicroVM.run` fails with `ExecError` only when the workload could not be started or its result could not be collected. It waits as long as the workload runs; for a deadline, wrap it in `Effect.timeout`. The VM is torn down when the enclosing scope closes.

### Host Access

A job cannot reach the host by default. `MicroVM.withHostAccess(true)` opens the host to the guest: every service listening on the host, including one bound to `127.0.0.1`, becomes reachable at `host.microsandbox.internal`. Public internet access stays on. Opt in only for jobs whose command you trust with every host service.

## Runtime Behaviour

### Automatic Port Allocation

Exposed guest ports are automatically paired with unallocated ephemeral ports on `127.0.0.1` prior to boot. Port mappings are accessible via `MicroVM.port(vm, guestPort)`. Any rendered configuration targeting non-loopback interfaces fails immediately with `LoopbackViolationError`.

### The `RunningVM` Handle

`MicroVM.spec(...).scoped` yields a `RunningVM` — a branded, pipeable record of data whose operations are standalone duals. The native sandbox driver never appears on the handle's surface; only these operations reach it, and an operation run after the handle's scope has closed dies with `Handle.HandleReleased`:

- `MicroVM.exec(vm, cmd, args)`: Executes commands as argv lists (no shell injection vulnerabilities); resolves with `{ code, stdout, stderr }`.
- `MicroVM.logs(vm)`: Returns an Effect `Stream` of structured log entries (`source`, `text`).
- `MicroVM.ping(vm)`: Returns an Effect resolving to `true` if the guest agent responds.
- `MicroVM.port(vm, guestPort)`: Resolves with the host loopback port mapped to a guest port.
- `MicroVM.url(vm, guestPort, path?)`: Resolves with `http://127.0.0.1:<hostPort><path>`.
- `MicroVM.awaitExit(vm, argv)`: Awaits the default workload's exit and collects its code and bytes.
- `vm.name`: Unique sandbox identifier (`effect-microsandbox-<pid>-<suffix>`).

Every operation is dual: data-first (`MicroVM.exec(vm, 'echo', ['hi'])`) or piped (`vm.pipe(MicroVM.exec('echo', ['hi']))`).

### Failure Model

All operational failures are returned as typed errors in the `MicroVM.MicroVMError` union:

| Error                            | Cause                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `VirtualizationUnsupportedError` | Missing KVM (`/dev/kvm`), Hypervisor.framework, or WHP with specific diagnostic remediation        |
| `SandboxBootError`               | Runtime failed to initialize or start the microVM sandbox                                          |
| `PortAllocationError`            | Unable to bind a free host loopback port                                                           |
| `LoopbackViolationError`         | Port mapping targeted a disallowed non-loopback address                                            |
| `WaitTimeoutError`               | Readiness condition was not satisfied within the 30-second deadline                                |
| `ExecError`                      | An in-guest command or a job's workload could not be started, or its result could not be collected |

## Verification

### System Requirements

- **Effect**: v4 (`effect` catalog dependency).
- **Hardware Virtualization**:
  - Linux: KVM (`/dev/kvm` accessible with read/write permissions).
  - macOS: Apple Silicon with Hypervisor.framework.
  - Windows: Windows Hypervisor Platform (WHP).

### Smoke Journey

To verify end-to-end integration on a host with virtualization support:

```bash
pnpm --filter @systemfsoftware/effect-microsandbox smoke
```

The smoke journey boots Alpine Linux, executes an in-guest command, tests port mapping, confirms resource cleanup on interruption, and exercises resource reuse across sequential VM runs. Its job journeys check exit codes, signals, byte-exact output, host access with and without opt-in, and the working directory. On a host without virtualization it exits non-zero with `VirtualizationUnsupportedError`.

## License

Licensed under the [Apache-2.0 License](LICENSE).
