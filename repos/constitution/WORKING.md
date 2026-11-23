# Working

Rules for every agent in a systemfsoftware repository. Each repository imports
this file into its always-on `AGENTS.md` or `CLAUDE.md`. Local instructions may
narrow these rules, never loosen them.

- **SF-WRK-1** Deliver the whole task. Stop only when merged, in the merge
  queue, or blocked by something only the owner holds, and state which applies.
- **SF-WRK-2** Do reversible work without asking. Send any design or technical
  decision you would ask the owner to Gemini, report its answer, and proceed.
- **SF-WRK-3** Never spawn subagents unless explicitly requested by the owner in
  the current task.
- **SF-WRK-4** Never run full test suites, end-to-end tests, or microVM runs on
  shared hosts; leave them to CI.
- **SF-WRK-5** Before any destructive or broad action, restate the instruction's
  verb and object in one line and act strictly on that, not on a nearby
  interpretation.
- **SF-FIN-1** Never claim a task is done, blocked, or broken without concrete
  proof, such as a passing command, compiler error, or observed system state.
