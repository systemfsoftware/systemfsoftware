# @systemfsoftware/effect-microsandbox

Effect-native integration-test containers backed by hardware-isolated microVMs. You declare the container as pure data, the library acquires it inside an Effect `Scope`, and teardown is a finalizer — no Docker daemon, no `beforeAll`/`afterAll`, no orphaned guests.

Built on the [`microsandbox`](https://github.com/superradcompany/microsandbox) napi SDK, which bundles the `msb` runtime and libkrunfw per platform. Every microVM runs on real virtualization: KVM on Linux, Hypervisor.framework on Apple Silicon, WHP on Windows. If the host has none, startup fails fast with a typed error that names the fix.

## Quick Start

```bash
pnpm add @systemfsoftware/effect-microsandbox
```

```ts
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Effect, HashMap } from 'effect'

const alpine = MicroVM.spec('alpine:3.20')
  .withExposedPorts([6379])
  .withWaitStrategy(MicroVM.Wait.forPort(6379))

const program = Effect.scoped(
  Effect.gen(function*() {
    const vm = yield* alpine.scoped
    const out = yield* vm.exec('echo', ['hello'])
    console.log(out.stdout) // hello
    console.log(HashMap.get(vm.mappedPorts, 6379)) // Option.some(<free 127.0.0.1 port>)
  }),
)

NodeRuntime.runMain(Effect.provide(program, nodeServicesLayer))
```

When the scope closes — normally or through interruption — the sandbox is stopped, destroyed, and its record removed. There is nothing to clean up by hand.

## Architecture

### Why MicroVMs

Shared-kernel containers leak state between tests and require a local Docker socket. Process-level fakes drift from real service semantics. A microVM gives each test an isolated hardware kernel with container-like ergonomics: standard image references, port publishing, and execution boundaries governed entirely by an Effect `Scope`.

### Layer & Scoped Execution

A configured container specification (`MicroVM.spec(...)`) directly exposes `.scoped` (to acquire inside an `Effect.scoped` block) and `.layer` (to provide as a testcontainer `Layer`). In accordance with `compound-packs/resource-algebra`, platform dependencies (`Crypto` and `FileSystem`) cleanly propagate to `R` and are satisfied once at your application or test composition root (such as `@effect/platform-node/NodeServices`).

## Specifying Containers

Containers are configured through a lawful staged builder. You start with a mandatory image identity via `MicroVM.spec(image)` and chain combinators before executing:

```ts
import { MicroVM } from '@systemfsoftware/effect-microsandbox'

const redis = MicroVM.spec('redis:7-alpine')
  .withExposedPorts([6379])
  .withMemoryLimit(512)
  .withWaitStrategy(MicroVM.Wait.forPort(6379))

// Acquire dynamically in a test scope:
const vm = yield* redis.scoped

// Or provide as a Layer:
const RedisLive = redis.layer
```

### Spec Combinators

| Combinator                 | Description                  |
| -------------------------- | ---------------------------- |
| `.withEnv(env)`            | Merges environment variables |
| `.withExposedPorts(ports)` | Replaces exposed guest ports |
| `.withMount(mount)`        | Appends a host bind mount    |
| `.withMemoryLimit(mb)`     | Sets memory limit in MiB     |
| `.withWaitStrategy(s)`     | Sets readiness wait strategy |

### Readiness Strategies

VM startup does not complete until the specified wait strategy passes (30-second budget before raising `WaitTimeoutError`):

- **Port Probe**: `MicroVM.Wait.forPort(guestPort)` dials the mapped host loopback port.
- **HTTP Probe**: `MicroVM.Wait.forHttp(path, guestPort)` issues a `GET` request and checks for a `2xx` status.
- **Log Pattern**: `MicroVM.Wait.forLog(pattern)` polls the guest log stream for a matching regex.

## Runtime Behaviour

### Automatic Port Allocation

Exposed guest ports are automatically paired with unallocated ephemeral ports on `127.0.0.1` prior to boot. Port mappings are accessible via `vm.mappedPorts` (`HashMap<number, number>`). Any rendered configuration targeting non-loopback interfaces fails immediately with `LoopbackViolationError`.

### The `RunningVM` Handle

`RunningVM` provides safe, typed primitives to control the active microVM:

- `exec(cmd, args)`: Executes commands as argv lists (no shell injection vulnerabilities); resolves with `{ code, stdout, stderr }`.
- `logs`: Returns an Effect `Stream` of structured log entries (`source`, `text`).
- `ping`: Returns an Effect resolving to `true` if the guest agent responds.
- `mappedPorts`: Read-only `HashMap` of guest-to-host port bindings.
- `name`: Unique sandbox identifier (`effect-microsandbox-<pid>-<suffix>`).

### Failure Model

All operational failures are returned as typed errors in the `MicroVMError.MicroVMError` union:

| Error                            | Cause                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `VirtualizationUnsupportedError` | Missing KVM (`/dev/kvm`), Hypervisor.framework, or WHP with specific diagnostic remediation |
| `SandboxBootError`               | Runtime failed to initialize or start the microVM sandbox                                   |
| `PortAllocationError`            | Unable to bind a free host loopback port                                                    |
| `LoopbackViolationError`         | Port mapping targeted a disallowed non-loopback address                                     |
| `WaitTimeoutError`               | Readiness condition was not satisfied within the 30-second deadline                         |
| `ExecError`                      | In-guest command execution exited with failure or could not run                             |

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

The smoke journey boots Alpine Linux, executes an in-guest command, tests port mapping, confirms resource cleanup on interruption, and exercises layer reuse across sequential VM runs.

## License

Licensed under the [Apache-2.0 License](LICENSE).
