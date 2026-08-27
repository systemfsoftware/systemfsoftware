---
title: Fix pre-push remote-main gate for HEAD pushes
issue: 262
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Plan: fix pre-push HEAD gate

## Objective

Fix `scripts/guards/check-remote-main.ts` so `git push origin HEAD` is gated; refuse when pushed commit lacks remote main ancestor.

## Requirements

- R1: stdin line with localRef `HEAD` treated as branch push, ancestry checked.
- R2: also handle `@` symbolic ref same way.
- R3: tags (`refs/tags/`) and delete (zero SHA) remain Ignore/Delete.
- R4: empty stdin fallback via headUpdate unchanged.
- R5: selftest covers HEAD behind→refuse, tag→allow, delete→allow.

## Units

- U1: fix decodePushLine to not Ignore HEAD/@ — map to Update path
- U2: selftest coverage

## Verification

- `./scripts/guards/check-remote-main.ts --selftest` green; reverting U1 makes HEAD case fail
- manual: `echo "HEAD <behind-sha> refs/heads/x <zero>" | deno run ...` refuses
