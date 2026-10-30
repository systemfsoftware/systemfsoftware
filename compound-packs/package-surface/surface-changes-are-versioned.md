---
title: A change to a published package's declared surface takes the bump its classification sets, whatever the version number
applies_when:
  - removing, renaming, moving, narrowing or adding an export, a subpath or an exported type of a published package
  - writing the change intent or changeset for a change to a published package's exports
  - reviewing a diff whose API report, exports map or entry modules changed
tags: [versioning, changeset, api-report, breaking-change, semver]
---

A published package is any package.json without `"private": true`, whatever its version and whether or not it is on a registry yet. Its declared surface is its exports map, the names each entry exports and the types those names reach.

Classify each change to the surface and write the change intent at the highest class:

- Breaking, a major intent: a name, entry or subpath removed, renamed or moved; an input narrowed (a parameter, option or field accepts less, or a required one is added); an output widened (a return type or returned field can hold more, including a new member of a union a consumer switches on).
- Addition, a minor intent: a new name, entry or subpath, or a new optional parameter, option or field, that leaves every existing use compiling and behaving as before.

A version below 1.0.0, a pre-release label, or a package not yet on a registry never lowers the class. Whether to make a breaking change at all is the host repository's policy; this rule sets only the bump.

An empty API report diff does not prove the surface unchanged: API Extractor reads only its one main entry and never the exports map. Read the classification from the diff of the exports map and of every entry module.

```markdown
<!-- WRONG: a rename at 0.4.2 -->
"@example/inventory-client": patch
<!-- RIGHT: a rename is a removal plus an addition -->
"@example/inventory-client": major
```
