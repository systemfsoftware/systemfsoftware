# Evidence Backend Review

Review the backend only: find and correct every `@evidence` and `@evidenceExclude` that is not true of its host, and every place the code contradicts a requirement it cites.

Set `"evidence/review"` to `"error"` in `packages/api/lint.config.ts` and `packages/backend/test/lint.config.ts` first, then write a review beside every acknowledgement as you check it. The rule proves a review is present; whether it names a check you performed is this review's question.

Read `.agents/skills/review/SKILL.md` and `.agents/skills/review/backend.md` before working, and follow them exactly.

## Final Checklist

- [ ] `evidence/review` set to `error` in `packages/api/lint.config.ts` and `packages/backend/test/lint.config.ts`.
- [ ] Every backend claim still enabled, with `evidence/graph` and `evidence/todo` at `error`.
- [ ] Nothing else in either configuration changed.
- [ ] Every active backend `@evidence` and `@evidenceExclude` is true of its host, corrected wherever it was not, and never by correcting the requirement.
- [ ] Every acknowledgement carries a review naming a check you performed.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.
- [ ] `pnpm test` exits with code 0 after the last correction.

Any unchecked item leaves the Goal active. Complete that item.
