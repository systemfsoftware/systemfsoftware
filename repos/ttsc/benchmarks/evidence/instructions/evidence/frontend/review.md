# Evidence Frontend Review

Review the frontend only: find and correct every `@evidence` and `@evidenceExclude` that is not true of its host, and every place the code contradicts a requirement it cites.

Set `"evidence/review"` to `"error"` in `packages/frontend/lint.config.ts` first, then write a review beside every acknowledgement as you check it. The rule proves a review is present; whether it names a check you performed is this review's question.

Read `.agents/skills/review/SKILL.md` and `.agents/skills/review/frontend.md` before working, and follow them exactly.

## Final Checklist

- [ ] `evidence/review` set to `error` in `packages/frontend/lint.config.ts`.
- [ ] Every claim in all three configurations still enabled, with `evidence/graph`, `evidence/review`, and `evidence/todo` at `error`.
- [ ] Nothing else in the three changed, since no later scope reviews them.
- [ ] Every active frontend `@evidence` and `@evidenceExclude` is true of its host, corrected wherever it was not, and never by correcting the requirement.
- [ ] Every acknowledgement carries a review naming a check you performed.
- [ ] Every carrier entry deferring to the other layer checked against what that layer now delivers.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.
- [ ] Live-backend `pnpm test:e2e` exits with code 0 after the last correction.

Any unchecked item leaves the Goal active. Complete that item.
