# AGENTS.md — `@systemfsoftware/oxlint-plugin-effect-workflow`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. Rules here gate `CONSTITUTION.md` Articles I–II.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                               | Gate                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **EW1** | Prohibitions only. The obligation — a workflow declares its Command, Decision, and Error as `S.TaggedClass`/`S.TaggedError` — is enforced upstream by `Workflow.make`'s `Inhabited` constraint at the construction site; never add a rule here that fails a workflow for lacking that declaration. | `review` — a proposed rule must not duplicate what `Workflow.make` already refuses |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow lint
```
