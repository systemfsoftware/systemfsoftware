# AGENTS.md — arethetypeswrong fork

Forked from https://github.com/arethetypeswrong/arethetypeswrong.github.io under `@systemfsoftware/arethetypeswrong-*`.

## Packages

| Package | npm name                                 | Dir     |
| ------- | ---------------------------------------- | ------- |
| Core    | `@systemfsoftware/arethetypeswrong-core` | `core/` |
| CLI     | `@systemfsoftware/arethetypeswrong-cli`  | `cli/`  |

## Stack

| Concern | Tool   |
| ------- | ------ |
| Build   | tsdown |
| Tests   | Vitest |
| Format  | dprint |

## Commands

```bash
# Build all
pnpm --filter @systemfsoftware/arethetypeswrong-core build
pnpm --filter @systemfsoftware/arethetypeswrong-cli build

# Test core
pnpm --filter @systemfsoftware/arethetypeswrong-core test

# Test CLI
pnpm --filter @systemfsoftware/arethetypeswrong-cli test
```
