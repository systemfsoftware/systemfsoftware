---
title: TTSR regex rules require explicit flag translation and generic backreferences
date: 2026-08-30
category: architecture-patterns
module: omp-plugin-constitution
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Authoring Time-Traveling Stream Rules (TTSR) markdown files with condition regexes
  - Writing validators for stream rules with PCRE inline flags like `(?i)` or `(?ims)`
  - Matching self-referential or tautological anti-patterns across tool streams
root_cause: tool_interface
tags: [ttsr, regex, omp, stream-rules, flag-translation, backreference]
---

# TTSR regex rules require explicit flag translation and generic backreferences

## Context

When creating an OMP plugin providing Time-Traveling Stream Rules (TTSR), rules are authored as Markdown documents with YAML frontmatter containing `condition` regex patterns and `scope` tool selectors.

Historical note (2026-09-01): the constitution plugin that surfaced these traps
has been removed entirely — the constitution is delivered by residency (always
in agent context), which makes every stream rule redundant: an interrupt can
only inject text the agent already has. The two traps below remain valid for
any TTSR plugin; the constitution corpus they were measured against is gone.

During implementation and review of the constitution plugin, two critical regex compilation and matching traps emerged:
1. **PCRE Inline Flags:** Authors frequently write `(?i)` or `(?ims)` in condition strings. Standard JavaScript / V8 `RegExp` engines reject leading `(?i)` group syntax as invalid groups (`SyntaxError: Invalid group`). The OMP capability layer translates leading PCRE flag groups (`/^\(\?([ims]+)\)/`) into native `RegExp` flags, but a custom validator that passes raw strings to `new RegExp(pattern)` fails valid rules, while failing to reject unsupported inline combinations (`(?imsu)` or mid-pattern flags).
2. **Literal vs Generic Anti-Pattern Matching:** Condition patterns targeting self-referential statements (e.g., asserting `expect(fn()).toBe(fn())`) fail completely when hardcoded to literal identifiers. To detect tautologies generically across all codebases without false negatives, condition regexes must use capturing groups and backreferences (`expect\(\s*(\w+)\s*\([^)]*\)\s*\)\.to(?:Be|Equal)\(\s*\1\s*\([^)]*\)\s*\)`).

## Guidance

- When validating TTSR condition regexes, implement the exact OMP inline flag translation (`/^\(\?([ims]+)\)/`) and reject unsupported flags explicitly before compiling.
- For anti-pattern rules that detect identical calls or operands on both sides of an operator, use regex backreferences (`\1`) rather than example identifiers.
- Validate the expected rule set strictly by exact filename or ID rather than loosely testing directory file counts.
