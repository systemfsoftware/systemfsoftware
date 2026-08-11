---
"@systemfsoftware/effect-memfs": major
---

Replace the MemoryFileSystem object with a Contents context tag. `MemoryFileSystem`, `make` and `layerWith` are gone; `layer` now requires `Contents`, and the seed type is `SeedContents`.
