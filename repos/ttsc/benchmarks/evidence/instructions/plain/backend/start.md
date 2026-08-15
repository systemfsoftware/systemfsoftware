# Backend Start

This stage owns only the complete first implementation of the API and backend. Do not implement the frontend or perform the review yet.

Read `AGENTS.md` and every document under `.agents/skills/backend/` in full before working, and obey them throughout, including the implementation order and Operation Ownership.

Start `pnpm check:watch` from `packages/backend` as a persistent background process before implementation, monitor its output, and keep it running through Overall Final.

## Final Checklist

- [ ] Complete requirement-derived schema, API, backend behavior, and tests implemented.
- [ ] Every published operation has its proving tests, each proving one primary operation.
- [ ] Prisma and SDK output regenerated after the latest owning-source change.
- [ ] Persistent watcher rebuilt cleanly after the latest scoped change.
- [ ] `pnpm test` passed against the current implementation.

Any unchecked item leaves the Goal active. Complete it and rerun every affected current-state gate.
