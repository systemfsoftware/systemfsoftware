## 4.0.0

### Major Changes

- The `DeliverDoctrine` verdict no longer carries a `reason` field. Where your code delivered the doctrine text, read the exported `DOCTRINE_KERNEL` constant instead.

### Patch Changes

- Refreshed builds on the platform-services dependency graph; the packages no longer reach for host builtins directly. No CLI flags or option names change.
