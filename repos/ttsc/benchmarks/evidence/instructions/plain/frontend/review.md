# Frontend Review

Review the entire frontend and its live behavior through the literal **review loop until dry**. Every round starts by reading every requirement under `docs/analysis/` in full, then reads the complete scope against it. The round gates are clean backend and frontend `pnpm dev` reloads.

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/frontend.md` in full before reviewing, and follow them without any discretionary change.

Before completion, report each round's full manifest, findings and fixes, and the final dry, edit-free round. If that evidence reveals missing work, resume the loop and report again.

## Final Checklist

- [ ] Review skill gate followed without changing scope, rounds, stopping condition, or procedure.
- [ ] Every required instruction was read in full.
- [ ] Every round used a new complete sorted manifest and read one file per command, in order and in full.
- [ ] Every correction or scoped change, including a gate fix, triggered a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Final full round dry and edit-free; the clean current backend and frontend gates left it unchanged.
- [ ] Report proves every round, finding, fix, and final dry round.

If any item is unchecked or uncertain, restart the full Frontend Review at the first requirement.
