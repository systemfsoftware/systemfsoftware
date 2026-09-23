---
"@systemfsoftware/effect-atom": major
---

`Registry.RegistryImpl` is now a type-only export and is no longer a constructible class: the `RegistryImpl` runtime value and `new RegistryImpl(...)` no longer exist. Create registries with `Registry.make(options)`, which is unchanged, and keep using `RegistryImpl` as a type for the values it returns.
