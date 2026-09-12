---
"@systemfsoftware/stryker-js": major
---

The machine-stream event class `MutantTested` (tag `mutant`) is renamed `RunMutantTested`.

The reporter-protocol event class keeps the name `MutantTested`; the two classes described different events under one name. Serialized stream output is unchanged — the rename is the exported binding only. If you constructed or matched the machine-stream class, import `RunMutantTested` from `@systemfsoftware/stryker-js/Run`.
