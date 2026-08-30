## 0.2.0

### Minor Changes

- Worker child processes now answer RPC over a local socket-path endpoint (a socket file on POSIX, a same-user named pipe on Windows) instead of a fork IPC channel. `makeChildProcessTestRunner` and `createCheckerFactory` additionally require the `FileSystem` and `Path` services in their environment.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/stryker-js@0.2.0
