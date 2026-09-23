## 1.0.0

### Patch Changes

- Two log lines no longer carry the `[effect-microsandbox]` prefix or build their values into the message text. The runtime announcement is now the message `microsandbox runtime resolved` followed by an object with `runtime.path` and `runtime.origin`. The debug line for a refused topology is now `virtualization topology refused` followed by an object with `virtualization.topology`. Log filters that match the old text need updating. Public APIs are unchanged.
