---
title: A change to a published package's declared surface takes the bump its classification sets, whatever the version number
applies_when:
  - removing, renaming, moving, narrowing or adding an export, a subpath or an exported type of a published package
  - writing the change intent or changeset for a change to a published package's exports
  - reviewing a diff whose API report, exports map or entry modules changed
tags: [versioning, changeset, api-report, breaking-change, semver]
---

A published package is any package.json without "private": true, whatever its version and whether or not it is on a registry yet.
Its declared surface is its exports map, the names each entry exports and the types those names reach.
Each change to the declared surface falls in one class:

- breaking, a major intent: a name, entry or subpath removed, renamed or moved; an input narrowed (a parameter, option or field accepts less, or a required option or field is added); an output widened (a return type, or a field of a returned value, can now hold more, including a new member of a union a consumer switches on).
- addition, a minor intent: a new name, entry or subpath, or a new optional parameter, option or field, that leaves every existing use compiling and behaving as before.
  A version below 1.0.0, an alpha or pre-release label, or a package not yet on a registry never lowers the class. Whether to make a breaking change at all is the host repository's policy; this rule sets only the bump a breaking change takes.
  An empty API report diff is never proof that the surface is unchanged: an API Extractor report reads only its one main entry and never the exports map, so the classification is read from the diff of the exports map and of every entry module.

Decision test: list every change the diff makes to a published package's exports map, entry modules and the exported types they reach, and give each its class. The diff fails when the change intent names that package with a lower bump than the highest class in the list, or names no bump for it.

Defect prevented: a consumer on a caret range takes a minor or patch update that removes or narrows something it uses, and its build or its runtime breaks without a version number ever warning it.

```markdown
<!-- WRONG: an inventory client at 0.4.2 renames reserve to hold -->
---
"@example/inventory-client": patch
---

Renamed reserve to hold.
```

```markdown
<!-- RIGHT: the same rename is a removal plus an addition, so it is breaking whatever the 0.x version -->
---
"@example/inventory-client": major
---

`reserve` is now `hold`; callers of `reserve` must switch to `hold`.
```

Source: Semantic Versioning 2.0.0, item 8: the major version "MUST be incremented if any backward incompatible changes are introduced to the public API", and item 7: the minor version "MUST be incremented if new, backward compatible functionality is introduced to the public API" (https://semver.org/). SemVer item 4 lets anything change below 1.0.0; this pack's ruling does not take that exception. API Extractor, mainEntryPointFilePath: the report "analyzes the symbols exported by this module", one entry (https://api-extractor.com/pages/configs/api-extractor_json/#mainentrypointfilepath).

Gate: judge
