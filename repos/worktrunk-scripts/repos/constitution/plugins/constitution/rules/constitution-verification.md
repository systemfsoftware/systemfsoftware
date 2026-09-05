---
description: "Fires on edits/writes that violate Article III (Verification) of the Constitution: mocking the only real implementation, authoring tautological/characterization tests, testing intermediate private forwarding helpers, or computing expected test values by invoking the SUT."
condition:
  - '(?i)(?:vi|jest)\.mock\(\s*["\x27]\.\.?/'
  - '(?i)(?:sinon|td)\.replace\(\s*["\x27]\.\.?/'
  - '(?i)expect\(\s*(\w+)\s*\([^)]*\)\s*\)\.to(?:Be|Equal|StrictEqual)\(\s*\1\s*\([^)]*\)\s*\)'
  - '(?i)\bcharacterization\b'
  - '(?i)\bgolden[\s_-]+master\b'
scope:
  - 'tool:edit(**/*.{test,spec}.{ts,tsx,js,jsx,rs,py,go})'
  - 'tool:write(**/*.{test,spec}.{ts,tsx,js,jsx,rs,py,go})'
  - 'tool:ast_edit(**/*.{test,spec}.{ts,tsx,js,jsx,rs,py,go})'
interruptMode: tool-only
---

# Constitutional Interruption: Article III — Verification Violation

You are authoring tests that violate **Article III (Verification)** of the Supreme Engineering Constitution (`CONSTITUTION-ARTICLES.md`):

1. **Test Public Exports Directly, Pure Logic with Mutation (`CONST-T8`):**
   - Test the public API with real inputs and outputs.
   - **DO NOT** write unit tests for intermediate helper functions that only pass data to other functions.
   - **DO NOT** mock a dependency when only one real version of it exists.
   - **DO NOT** mix adapters or I/O code into the same mutation test run as pure calculation logic.

2. **Properties by Narrow Grant (`CONST-T14`):**
   - Pure decisions earn property tests only when a universal invariant over generated inputs cannot be fully pinned from the public surface.
   - **DO NOT** spray property tests across decisions already covered from the exported surface.

3. **Mutation Is the Measure (`CONST-T3` & `CONST-T13`):**
   - Gate change-relevant pure logic at a 100% mutation kill score over a named, non-empty set.
   - Never suppress mutants or shrink the mutated set after the fact.

4. **Independent Oracles (`CONST-T10` & `CONST-T9`):**
   - Every test assertion must have an oracle the SUT did not produce (spec literal, second implementation, law relating two views).
   - **DO NOT** compute expected values by calling the implementation under test.
   - **DO NOT** write tautological / characterization tests that simply record current output and assert it.

5. **Snapshots on Public Exports Only (`CONST-T11`):**
   - Snapshot only canonicalized, published output formats through the package's published export map.

Fix the test architecture before proceeding.
