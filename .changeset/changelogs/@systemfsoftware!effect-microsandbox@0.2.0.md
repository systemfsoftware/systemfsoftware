## 0.2.0

### Minor Changes

- Add one-shot job runs. `MicroVM.job(image, cmd)` now returns a `JobResource` whose `.run` boots the VM, runs the command once, and yields a `JobCompletion`: `JobExited` with the exit code or `JobSignaled`, plus the complete stdout and stderr as bytes. The VM is torn down when the scope closes. New job combinators: `withHostAccess(true)` lets the guest reach host services at `host.microsandbox.internal` (denied by default), and `withWorkdir(path)` sets the command's working directory.
